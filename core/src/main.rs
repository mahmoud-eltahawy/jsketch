use bevy::{
    camera_controller::free_camera::{FreeCamera, FreeCameraPlugin},
    prelude::*,
};
use coordientates::CoordinatesPlugin;

use crate::shapes::ShapesPlugin;

mod coordientates;
mod shapes;

fn main() -> AppExit {
    App::new()
        .add_plugins((
            DefaultPlugins,
            FreeCameraPlugin,
            CoordinatesPlugin,
            ShapesPlugin,
        ))
        .insert_resource(ClearColor(Color::BLACK))
        .add_systems(Startup, setup_camera)
        .run()
}

fn setup_camera(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(1., 3., 10.).looking_at(Vec3::ZERO, Vec3::Y),
        FreeCamera::default(),
    ));
}
