use std::env;
use std::path::PathBuf;
use std::process::Command;

fn main() {
    // Tauri's MSI bundling invokes WiX `light.exe`. In some Windows environments, ICE validation
    // fails (LGHT0217 / ICE0x). Passing `-sval` disables MSI/MSM validation and unblocks bundling.
    //
    // This wrapper is intended to be placed as `light.exe` alongside a renamed `light-real.exe`
    // in the same directory, so it can transparently add `-sval` (and `-sacl`) to the invocation.
    let current_exe = match env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("light wrapper: unable to get current exe path: {e}");
            std::process::exit(1);
        }
    };

    let real_exe: PathBuf = current_exe
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .join("light-real.exe");

    if !real_exe.exists() {
        eprintln!(
            "light wrapper: expected real WiX linker at '{}' but it does not exist",
            real_exe.display()
        );
        std::process::exit(1);
    }

    let mut incoming_args: Vec<String> = env::args().skip(1).collect();

    // Insert flags unless already provided.
    let has_flag = |flag: &str, args: &[String]| args.iter().any(|a| a.eq_ignore_ascii_case(flag));
    let mut args: Vec<String> = Vec::with_capacity(incoming_args.len() + 2);
    if !has_flag("-sval", &incoming_args) {
        args.push("-sval".to_string());
    }
    if !has_flag("-sacl", &incoming_args) {
        args.push("-sacl".to_string());
    }
    args.append(&mut incoming_args);

    let status = match Command::new(&real_exe).args(&args).status() {
        Ok(s) => s,
        Err(e) => {
            eprintln!(
                "light wrapper: failed to start '{}': {e}",
                real_exe.display()
            );
            std::process::exit(1);
        }
    };

    std::process::exit(status.code().unwrap_or(1));
}

