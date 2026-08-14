use readingroom_core::error::{AppError, Result};

/// Convert a file from one format to another using external tools.
/// Supports ebook formats via calibre's `ebook-convert` and audio via `ffmpeg`.
pub async fn convert_file(
    source: &std::path::Path,
    target_ext: &str,
) -> Result<std::path::PathBuf> {
    let source_ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if source_ext == target_ext {
        return Err(AppError::Validation(format!(
            "Source and target formats are the same: {source_ext}"
        )));
    }

    let target = source.with_extension(target_ext);

    let is_ebook = matches!(source_ext.as_str(), "epub" | "mobi" | "azw3" | "pdf")
        && matches!(target_ext, "epub" | "mobi" | "azw3" | "pdf");

    let is_audio = matches!(source_ext.as_str(), "mp3" | "m4b" | "flac" | "m4a" | "ogg" | "opus")
        && matches!(target_ext, "mp3" | "m4b" | "flac" | "m4a" | "ogg" | "opus");

    if is_ebook {
        convert_via_ebook_convert(source, &target).await?;
    } else if is_audio {
        convert_via_ffmpeg(source, &target).await?;
    } else {
        return Err(AppError::Validation(format!(
            "Unsupported conversion: {source_ext} → {target_ext}"
        )));
    }

    if !target.exists() {
        return Err(AppError::Other(format!(
            "Conversion produced no output file: {}",
            target.display()
        )));
    }

    Ok(target)
}

async fn convert_via_ebook_convert(source: &std::path::Path, target: &std::path::Path) -> Result<()> {
    let output = tokio::process::Command::new("ebook-convert")
        .arg(source)
        .arg(target)
        .output()
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::Other(
                    "ebook-convert not found. Install calibre (nixpkgs: `calibre`) to enable ebook conversion.".into(),
                )
            } else {
                AppError::Io(e)
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!(
            "ebook-convert failed: {stderr}"
        )));
    }

    Ok(())
}

async fn convert_via_ffmpeg(source: &std::path::Path, target: &std::path::Path) -> Result<()> {
    let output = tokio::process::Command::new("ffmpeg")
        .arg("-y")
        .arg("-i")
        .arg(source)
        .arg(target)
        .output()
        .await
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::Other(
                    "ffmpeg not found. Install ffmpeg (nixpkgs: `ffmpeg`) to enable audio conversion.".into(),
                )
            } else {
                AppError::Io(e)
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::Other(format!("ffmpeg failed: {stderr}")));
    }

    Ok(())
}
