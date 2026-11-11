use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Duration;

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
7. Never claim to have edited a file unless the
   application actually performed that edit.
8. Ask for clarification when requirements are unclear.
9. When asked to modify a file, provide the complete
   updated file inside a fenced code block.

10. Do not provide partial snippets when a complete
    file replacement is requested.

11. Preserve existing functionality unless the user
    explicitly requests its removal.

12. Clearly identify the programming language
    in every generated code block.
"#;

fn build_instructions(context: Option<FileContext>) -> String {
    let mut instructions = SYSTEM_PROMPT.to_string();

    if let Some(file) = context {
        instructions.push_str(&format!(
            "\n\nCURRENT EDITOR CONTEXT\n\
             File: {}\n\
             Language: {}\n\
             File contents:\n\
             ```{}\n{}\n```\n\
             Use this file as context when answering the user.",
            file.file_name, file.language, file.language, file.content
        ));
    }

    instructions
}

fn validate_messages(messages: &[ChatMessage]) -> Result<(), String> {
    if messages.is_empty() {
        return Err("Conversation is empty.".into());
    }

    if messages
        .iter()
        .any(|m| m.role != "user" && m.role != "assistant")
    {
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

async fn read_api_response(response: reqwest::Response, provider: &str) -> Result<Value, String> {
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

        return Err(format!("{} API error ({}): {}", provider, status, error));
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
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| default_model.to_string());

    let instructions = build_instructions(context);

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    match provider.as_str() {
        "openai" => openai_chat(&client, api_key.trim(), &model, &instructions, &messages).await,

        "google" => google_chat(&client, api_key.trim(), &model, &instructions, &messages).await,

        "anthropic" => {
            anthropic_chat(&client, api_key.trim(), &model, &instructions, &messages).await
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

const AI_SETTINGS_SERVICE: &str = "koai";
const AI_SETTINGS_ACCOUNT: &str = "ai-settings";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AISettings {
    pub provider: String,
    pub model: String,
    pub custom_url: String,
    pub api_key: String,
}

#[tauri::command]
pub fn save_ai_settings(
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

    let settings = AISettings {
        provider,
        api_key,
        model: model.unwrap_or_default(),
        custom_url: custom_url.unwrap_or_default(),
    };

    let serialized = serde_json::to_string(&settings)
        .map_err(|e| format!("Could not serialize AI settings: {}", e))?;

    let entry = keyring::Entry::new(AI_SETTINGS_SERVICE, AI_SETTINGS_ACCOUNT)
        .map_err(|e| format!("Credential storage error: {}", e))?;

    entry
        .set_password(&serialized)
        .map_err(|e| format!("Could not save AI settings: {}", e))?;
    let saved = entry
        .get_password()
        .map_err(|e| format!("Verification failed: {}", e))?;

    if saved != serialized {
        return Err("Saved settings verification failed.".into());
    }

    Ok(())
}

#[tauri::command]
pub fn get_ai_settings() -> Result<Option<AISettings>, String> {
    let entry = keyring::Entry::new(AI_SETTINGS_SERVICE, AI_SETTINGS_ACCOUNT)
        .map_err(|e| format!("Credential storage error: {}", e))?;

    let password = match entry.get_password() {
        Ok(password) => password,

        Err(keyring::Error::NoEntry) => {
            return Ok(None);
        }

        Err(error) => {
            return Err(format!("Could not retrieve AI settings: {}", error));
        }
    };

    let settings: AISettings =
        serde_json::from_str(&password).map_err(|e| format!("Invalid saved AI settings: {}", e))?;

    Ok(Some(settings))
}
