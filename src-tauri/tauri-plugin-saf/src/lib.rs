use tauri::{
  plugin::{Builder, TauriPlugin},
  Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::Saf;
#[cfg(mobile)]
use mobile::Saf;

/// Extensions to [`tauri::App`], [`tauri::AppHandle`] and [`tauri::Window`] to access the saf APIs.
pub trait SafExt<R: Runtime> {
  fn saf(&self) -> &Saf<R>;
}

impl<R: Runtime, T: Manager<R>> crate::SafExt<R> for T {
  fn saf(&self) -> &Saf<R> {
    self.state::<Saf<R>>().inner()
  }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("saf")
    .invoke_handler(tauri::generate_handler![commands::ping])
    .setup(|app, api| {
      #[cfg(mobile)]
      let saf = mobile::init(app, api)?;
      #[cfg(desktop)]
      let saf = desktop::init(app, api)?;
      app.manage(saf);
      Ok(())
    })
    .build()
}
