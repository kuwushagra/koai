use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use rand::{rngs::OsRng, RngCore};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::Write,
    path::PathBuf,
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Manager, State};
use zeroize::Zeroizing;

const AI_SETTINGS_FILE: &str = "ai-settings.enc";

const SYSTEM_PROMPT: &str = r#"
You are koai, an expert AI coding assistant.

Help users with:
- Writing and generating code.
- Explaining existing code.
- Debugging and fixing errors.
- Refactoring and improving code.
- Creating complete files and components.
- Understanding project architecture.

Rules:
1. Always follow the user's requested programming language.
2. Generate complete, usable code when requested.
3. Do not replace code with placeholders unnecessarily.
4. Explain which file should contain generated code.
5. When fixing bugs, explain what was wrong.
6. Use Markdown formatting for readable answers.
7. Never claim to have edited a file unless the application actually performed that edit.
8. Ask for clarification when requirements are unclear.
9. When asked to modify a file, provide the complete updated file inside a fenced code block.
10. Do not provide partial snippets when a complete file replacement is requested.
11. Preserve existing functionality unless the user explicitly requests its removal.
12. Clearly identify the programming language in every generated code block.
"#;

#[derive(Debug, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct FileContext {
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub language: String,
    pub content: String,
}

fn build_instructions(context: Option<FileContext>) -> String {
    let mut instructions = SYSTEM_PROMPT.to_string();

    if let Some(file) = context {
        instructions.push_str(&format!(
            "\n\nCURRENT EDITOR CONTEXT\nFile: {}\nLanguage: {}\nFile contents:\n```{}\n{}\n```\nUse this file as context when answering the user.",
            file.file_name,
            file.language,
            file.language,
            file.content
        ));
    }

    instructions
}

fn validate_messages(messages: &[ChatMessage]) -> Result<(), String> {
    if messages.is_empty() {
        return Err("Conversation is empty.".into());
    }

    if messages.iter().any(|message| {
        message.role != "user" && message.role != "assistant"
    }) {
        return Err("Invalid conversation message role.".into());
    }

    Ok(())
}

fn extract_openai_text(body: &Value) -> String {
    let mut output = String::new();

    if let Some(items) = body["output"].as_array() {
        for item in items {
            if item["type"] != "message" {
                continue;
            }

            if let Some(contents) = item["content"].as_array() {
                for content in contents {
                    if content["type"] == "output_text" {
                        if let Some(text) = content["text"].as_str() {
                            output.push_str(text);
                        }
                    }
                }
            }
        }
    }

    output
}

async fn read_api_response(
    response: reqwest::Response,
    provider: &str,
) -> Result<Value, String> {
    let status = response.status();

    let text = response
        .text()
        .await
        .map_err(|e| format!("Could not read {} response: {}", provider, e))?;

    let body: Value = serde_json::from_str(&text).map_err(|_| {
        format!(
            "{} returned an invalid response ({}): {}",
            provider, status, text
        )
    })?;

    if !status.is_success() {
        let error = body["error"]["message"]
            .as_str()
            .or_else(|| body["message"].as_str())
            .unwrap_or("Unknown API error");

        return Err(format!(
            "{} API error ({}): {}",
            provider, status, error
        ));
    }

    Ok(body)
}

async fn openai_chat(
    client: &Client,
    api_key: &str,
    model: &str,
    instructions: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let input: Vec<Value> = messages
        .iter()
        .map(|message| {
            json!({
                "role": message.role,
                "content": message.content
            })
        })
        .collect();

    let body = json!({
        "model": model,
        "instructions": instructions,
        "input": input,
        "max_output_tokens": 8000,
        "store": false
    });

    let response = client
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI connection error: {}", e))?;

    let body = read_api_response(response, "OpenAI").await?;
    let output = extract_openai_text(&body);

    if output.trim().is_empty() {
        return Err("OpenAI returned no text.".into());
    }

    Ok(output)
}

async fn google_chat(
    client: &Client,
    api_key: &str,
    model: &str,
    instructions: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let contents: Vec<Value> = messages
        .iter()
        .map(|message| {
            json!({
                "role": if message.role == "assistant" {
                    "model"
                } else {
                    "user"
                },
                "parts": [{
                    "text": message.content
                }]
            })
        })
        .collect();

    let body = json!({
        "systemInstruction": {
            "parts": [{
                "text": instructions
            }]
        },
        "contents": contents,
        "generationConfig": {
            "maxOutputTokens": 8000
        }
    });

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
        model
    );

    let response = client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Google connection error: {}", e))?;

    let body = read_api_response(response, "Google Gemini").await?;

    let mut output = String::new();

    if let Some(parts) = body["candidates"][0]["content"]["parts"].as_array() {
        for part in parts {
            if let Some(text) = part["text"].as_str() {
                output.push_str(text);
            }
        }
    }

    if output.trim().is_empty() {
        return Err(
            "Google Gemini returned no text. The response may have been blocked or contain no candidate.".into()
        );
    }

    Ok(output)
}

async fn anthropic_chat(
    client: &Client,
    api_key: &str,
    model: &str,
    instructions: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let input: Vec<Value> = messages
        .iter()
        .map(|message| {
            json!({
                "role": message.role,
                "content": message.content
            })
        })
        .collect();

    let body = json!({
        "model": model,
        "max_tokens": 8000,
        "system": instructions,
        "messages": input
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic connection error: {}", e))?;

    let body = read_api_response(response, "Anthropic").await?;

    let mut output = String::new();

    if let Some(contents) = body["content"].as_array() {
        for item in contents {
            if item["type"] == "text" {
                if let Some(text) = item["text"].as_str() {
                    output.push_str(text);
                }
            }
        }
    }

    if output.trim().is_empty() {
        return Err("Anthropic returned no text.".into());
    }

    Ok(output)
}

async fn custom_chat(
    client: &Client,
    api_key: &str,
    model: &str,
    custom_url: Option<&str>,
    instructions: &str,
    messages: &[ChatMessage],
) -> Result<String, String> {
    let base_url = custom_url
        .filter(|url| !url.trim().is_empty())
        .ok_or("Custom API endpoint is missing.")?
        .trim()
        .trim_end_matches('/');

    let url = if base_url.ends_with("/chat/completions") {
        base_url.to_string()
    } else if base_url.ends_with("/v1") {
        format!("{}/chat/completions", base_url)
    } else {
        format!("{}/v1/chat/completions", base_url)
    };

    let mut input = vec![json!({
        "role": "system",
        "content": instructions
    })];

    for message in messages {
        input.push(json!({
            "role": message.role,
            "content": message.content
        }));
    }

    let body = json!({
        "model": model,
        "messages": input,
        "max_tokens": 8000
    });

    let response = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Custom API connection error: {}", e))?;

    let body = read_api_response(response, "Custom API").await?;

    let output = body["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    if output.trim().is_empty() {
        return Err("Custom API returned no text.".into());
    }

    Ok(output)
}

#[tauri::command]
pub async fn ai_chat(
    provider: String,
    api_key: String,
    model: Option<String>,
    custom_url: Option<String>,
    messages: Vec<ChatMessage>,
    context: Option<FileContext>,
) -> Result<String, String> {
    let provider = provider.trim().to_lowercase();

    if api_key.trim().is_empty() {
        return Err("API key is missing.".into());
    }

    validate_messages(&messages)?;

    let default_model = match provider.as_str() {
        "openai" => "gpt-5.5",
        "google" => "gemini-3.5-flash",
        "anthropic" => "claude-sonnet-4-5",
        "custom" => "default",
        _ => return Err(format!("Unsupported AI provider: {}", provider)),
    };

    let model = model
        .filter(|model| !model.trim().is_empty())
        .unwrap_or_else(|| default_model.to_string());

    let instructions = build_instructions(context);

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    match provider.as_str() {
        "openai" => {
            openai_chat(
                &client,
                api_key.trim(),
                &model,
                &instructions,
                &messages,
            )
            .await
        }
        "google" => {
            google_chat(
                &client,
                api_key.trim(),
                &model,
                &instructions,
                &messages,
            )
            .await
        }
        "anthropic" => {
            anthropic_chat(
                &client,
                api_key.trim(),
                &model,
                &instructions,
                &messages,
            )
            .await
        }
        "custom" => {
            custom_chat(
                &client,
                api_key.trim(),
                &model,
                custom_url.as_deref(),
                &instructions,
                &messages,
            )
            .await
        }
        _ => Err("Unsupported AI provider.".into()),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct AISettings {
    pub provider: String,
    pub model: String,
    pub custom_url: String,
    pub api_key: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct EncryptedSettings {
    salt: Vec<u8>,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
}

#[derive(Default)]
pub struct AIEncryptionState {
    key: Mutex<Option<Zeroizing<[u8; 32]>>>,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("App data directory error: {e}"))?;

    fs::create_dir_all(&directory)
        .map_err(|e| format!("Could not create settings directory: {e}"))?;

    Ok(directory.join(AI_SETTINGS_FILE))
}

fn derive_key(
    password: &str,
    salt: &[u8],
) -> Result<Zeroizing<[u8; 32]>, String> {
    let mut key = Zeroizing::new([0u8; 32]);

    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key[..])
        .map_err(|e| format!("Key derivation failed: {e}"))?;

    Ok(key)
}

fn encrypt_settings(
    settings: &AISettings,
    key: &[u8; 32],
    salt: Vec<u8>,
) -> Result<EncryptedSettings, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Encryption initialization failed: {e}"))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);

    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext = Zeroizing::new(
        serde_json::to_vec(settings)
            .map_err(|e| format!("Settings serialization failed: {e}"))?,
    );

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_ref())
        .map_err(|_| "Settings encryption failed.".to_string())?;

    Ok(EncryptedSettings {
        salt,
        nonce: nonce_bytes.to_vec(),
        ciphertext,
    })
}

fn decrypt_settings(
    encrypted: &EncryptedSettings,
    key: &[u8; 32],
) -> Result<AISettings, String> {
    if encrypted.nonce.len() != 12 {
        return Err("Invalid encryption nonce.".into());
    }

    if encrypted.salt.len() != 16 {
        return Err("Invalid encryption salt.".into());
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| format!("Decryption initialization failed: {e}"))?;

    let nonce = Nonce::from_slice(&encrypted.nonce);

    let plaintext = Zeroizing::new(
        cipher
            .decrypt(nonce, encrypted.ciphertext.as_ref())
            .map_err(|_| {
                "Incorrect master password or corrupted settings.".to_string()
            })?,
    );

    serde_json::from_slice(&plaintext)
        .map_err(|e| format!("Settings deserialization failed: {e}"))
}

fn read_encrypted_settings(
    app: &AppHandle,
) -> Result<EncryptedSettings, String> {
    let path = settings_path(app)?;

    let data = fs::read(path)
        .map_err(|e| format!("Could not read encrypted settings: {e}"))?;

    serde_json::from_slice(&data)
        .map_err(|e| format!("Invalid encrypted settings file: {e}"))
}

fn write_encrypted_settings(
    app: &AppHandle,
    encrypted: &EncryptedSettings,
) -> Result<(), String> {
    let path = settings_path(app)?;

    let data = serde_json::to_vec(encrypted)
        .map_err(|e| format!("Settings serialization failed: {e}"))?;

    let temporary_path = path.with_extension("tmp");

    let mut file = fs::File::create(&temporary_path)
        .map_err(|e| format!("Could not create settings file: {e}"))?;

    file.write_all(&data)
        .map_err(|e| format!("Could not write settings: {e}"))?;

    file.sync_all()
        .map_err(|e| format!("Could not sync settings: {e}"))?;

    fs::rename(&temporary_path, &path)
        .map_err(|e| format!("Could not finalize settings: {e}"))?;

    Ok(())
}

fn validate_master_password(password: &str) -> Result<(), String> {
    if password.chars().count() < 12 {
        return Err(
            "Master password must contain at least 12 characters.".into(),
        );
    }

    Ok(())
}

#[tauri::command]
pub fn has_ai_settings(app: AppHandle) -> Result<bool, String> {
    let path = settings_path(&app)?;
    Ok(path.exists())
}

#[tauri::command]
pub fn setup_master_password(
    app: AppHandle,
    state: State<'_, AIEncryptionState>,
    password: String,
) -> Result<(), String> {
    validate_master_password(&password)?;

    let mut stored_key = state
        .key
        .lock()
        .map_err(|e| format!("Security state error: {e}"))?;

    let path = settings_path(&app)?;

    if path.exists() {
        return Err("Encrypted AI settings already exist.".into());
    }

    let mut salt = vec![0u8; 16];
    OsRng.fill_bytes(&mut salt);

    let key = derive_key(&password, &salt)?;

    let encrypted = encrypt_settings(
        &AISettings::default(),
        &key,
        salt,
    )?;

    write_encrypted_settings(&app, &encrypted)?;

    *stored_key = Some(key);

    Ok(())
}

#[tauri::command]
pub fn unlock_ai_settings(
    app: AppHandle,
    state: State<'_, AIEncryptionState>,
    password: String,
) -> Result<AISettings, String> {
    let encrypted = read_encrypted_settings(&app)?;

    if encrypted.salt.len() != 16 {
        return Err("Invalid encryption salt.".into());
    }

    let key = derive_key(&password, &encrypted.salt)?;

    let settings = decrypt_settings(&encrypted, &key)?;

    let mut stored_key = state
        .key
        .lock()
        .map_err(|e| format!("Security state error: {e}"))?;

    *stored_key = Some(key);

    Ok(settings)
}

#[tauri::command]
pub fn lock_ai_settings(
    state: State<'_, AIEncryptionState>,
) -> Result<(), String> {
    let mut stored_key = state
        .key
        .lock()
        .map_err(|e| format!("Security state error: {e}"))?;

    *stored_key = None;

    Ok(())
}

#[tauri::command]
pub fn is_ai_unlocked(
    state: State<'_, AIEncryptionState>,
) -> Result<bool, String> {
    let stored_key = state
        .key
        .lock()
        .map_err(|e| format!("Security state error: {e}"))?;

    Ok(stored_key.is_some())
}

#[tauri::command]
pub fn save_ai_settings(
    app: AppHandle,
    state: State<'_, AIEncryptionState>,
    provider: String,
    api_key: String,
    model: Option<String>,
    custom_url: Option<String>,
) -> Result<(), String> {
    if provider.trim().is_empty() {
        return Err("Please select an AI provider.".into());
    }

    if api_key.trim().is_empty() {
        return Err("API key cannot be empty.".into());
    }

    let stored_key = state
        .key
        .lock()
        .map_err(|e| format!("Security state error: {e}"))?;

    let key = stored_key
        .as_ref()
        .ok_or("AI settings are locked.")?;

    let path = settings_path(&app)?;

    if !path.exists() {
        return Err("AI encryption has not been initialized.".into());
    }

    let encrypted_file = read_encrypted_settings(&app)?;

    let settings = AISettings {
        provider: provider.trim().to_string(),
        model: model.unwrap_or_default(),
        custom_url: custom_url.unwrap_or_default(),
        api_key: api_key.trim().to_string(),
    };

    let encrypted = encrypt_settings(
        &settings,
        &**key,
        encrypted_file.salt,
    )?;

    write_encrypted_settings(&app, &encrypted)?;

    Ok(())
}

#[tauri::command]
pub fn get_ai_settings(
    app: AppHandle,
    state: State<'_, AIEncryptionState>,
) -> Result<Option<AISettings>, String> {
    let stored_key = state
        .key
        .lock()
        .map_err(|e| format!("Security state error: {e}"))?;

    let key = match stored_key.as_ref() {
        Some(key) => key,
        None => return Ok(None),
    };

    let path = settings_path(&app)?;

    if !path.exists() {
        return Ok(None);
    }

    let encrypted = read_encrypted_settings(&app)?;

    let settings = decrypt_settings(&encrypted, &**key)?;

    Ok(Some(settings))
}
