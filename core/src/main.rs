use std::{fs, path::PathBuf};

use bevy::{
    camera_controller::free_camera::{FreeCamera, FreeCameraPlugin},
    prelude::*,
};
use coordientates::CoordinatesPlugin;

use crate::shapes::{Shapes, animate_new_shapes, animate_shapes, prepare_channels};

use steel::steel_vm::engine::Engine;
use steel::steel_vm::register_fn::RegisterFn;

mod coordientates;
mod shapes;

fn main() -> AppExit {
    execute_script();

    App::new()
        .init_resource::<Shapes>()
        .add_plugins((DefaultPlugins, FreeCameraPlugin, CoordinatesPlugin))
        .add_systems(Startup, (setup_camera, prepare_channels))
        .add_systems(Update, animate_shapes)
        .add_systems(Update, animate_new_shapes)
        .run()
}

fn execute_script() {
    let mut args = std::env::args();
    let program_name = args.next().expect("program must exist!!");
    let path = match args.next().and_then(|x| x.parse::<PathBuf>().ok()) {
        Some(path) => path,
        None => {
            eprintln!("Usage: {} <script.scm>", program_name);
            std::process::exit(1);
        }
    };

    let mut engine = Engine::new();

    engine.register_fn("rust-multiply", |a: i64, b: i64| a * b);

    let script = fs::read_to_string(&path).unwrap();
    println!("Executing: {}\n", path.display());

    match engine.run(script) {
        Ok(results) => {
            println!("--- Results ---");
            for (i, val) in results.iter().enumerate() {
                println!("[{i}] {val:?}");
            }
        }
        Err(e) => eprintln!("Error during execution: {}", e),
    }
}

fn setup_camera(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(1., 1., 8.).looking_at(Vec3::ZERO, Vec3::Y),
        FreeCamera::default(),
    ));
}
