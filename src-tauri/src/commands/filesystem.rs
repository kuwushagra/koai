use serde::Serialize;
use std::fs;
use std::fs::OpenOptions;
use std::path::Path;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let directory = Path::new(&path);

    if !directory.is_dir() {
        return Err("Directory does not exist".into());
    }

    let mut entries = Vec::new();

    for item in fs::read_dir(directory).map_err(|e| e.to_string())? {
        let item = item.map_err(|e| e.to_string())?;
        let file_type = item.file_type().map_err(|e| e.to_string())?;

        if file_type.is_symlink() {
            continue;
        }

        let path = item.path();

        entries.push(FileEntry {
            name: item.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub fn create_entry(directory: String, name: String, is_directory: bool) -> Result<String, String> {
    validate_name(&name)?;

    let path = Path::new(&directory).join(&name);

    if is_directory {
        fs::create_dir(&path).map_err(|e| e.to_string())?;
    } else {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| e.to_string())?;
    }

    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn rename_entry(path: String, new_name: String) -> Result<String, String> {
    validate_name(&new_name)?;

    let old_path = Path::new(&path);

    let parent = old_path.parent().ok_or("Cannot rename this path")?;

    let new_path = parent.join(new_name);

    fs::rename(old_path, &new_path).map_err(|e| e.to_string())?;

    Ok(new_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    let path = Path::new(&path);

    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;

    if metadata.file_type().is_symlink() {
        return Err("Deleting symbolic links is not supported".into());
    }

    if metadata.is_dir() {
        fs::remove_dir_all(path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn parent_directory(path: String) -> Option<String> {
    Path::new(&path)
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
}

fn validate_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
    {
        return Err("Invalid file or folder name".into());
    }

    Ok(())
}
