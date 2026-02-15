use std::{ops::Range, time::Instant};

use bevy::{
    camera_controller::free_camera::{FreeCamera, FreeCameraPlugin},
    color::palettes::css::{GREEN, RED},
    prelude::*,
};
use coordientates::CoordinatesPlugin;

mod coordientates;

fn main() -> AppExit {
    App::new()
        .init_resource::<Shapes>()
        .add_plugins((DefaultPlugins, FreeCameraPlugin, CoordinatesPlugin))
        .add_systems(Startup, start)
        .add_systems(Update, animate_shapes)
        .run()
}

fn start(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(1., 1., 8.).looking_at(Vec3::ZERO, Vec3::Y),
        FreeCamera::default(),
    ));
}

enum Shape {
    Sin(SinShape),
    Circle(CircleShape),
}

#[derive(Resource)]
struct Shapes(Vec<Shape>);

impl Default for Shapes {
    fn default() -> Self {
        Self(vec![
            Shape::Circle(CircleShape::default()),
            Shape::Sin(SinShape::default()),
        ])
    }
}

struct CircleShape {
    begin: Instant,
    angle: f32,
    radius: f32,
    center: Vec3,
    speed: f32,
}

impl Default for CircleShape {
    fn default() -> Self {
        Self {
            begin: Instant::now(),
            angle: 0.,
            radius: 2.,
            center: Vec3::ZERO,
            speed: 60.,
        }
    }
}

fn animate_shapes(mut gizmos: Gizmos, mut shapes: ResMut<Shapes>) {
    for shape in &mut shapes.0 {
        match shape {
            Shape::Sin(ss) => {
                let x = ss.begin.elapsed().as_secs_f32();
                let start = ss.range.start;
                let end = ss.range.end;
                let x = start + x;
                if x <= end {
                    let y = ss.amplitude * (x * ss.frequency).sin();
                    ss.verts.push(Vec3 { x, y, z: 0. });
                }
                gizmos.linestrip(ss.verts.clone(), GREEN);
            }
            Shape::Circle(cs) => {
                let angle = cs.begin.elapsed().as_secs_f32() * cs.speed;
                if angle <= 363. {
                    cs.angle = angle;
                }

                gizmos
                    .arc_3d(
                        cs.angle.to_radians(),
                        cs.radius,
                        Isometry3d::new(cs.center, Quat::from_rotation_x(90.)),
                        RED,
                    )
                    .resolution(1000);
            }
        }
    }
}

struct SinShape {
    begin: Instant,
    verts: Vec<Vec3>,
    amplitude: f32,
    frequency: f32,
    range: Range<f32>,
}

impl Default for SinShape {
    fn default() -> Self {
        Self {
            begin: Instant::now(),
            verts: Default::default(),
            amplitude: 3.,
            frequency: 3.,
            range: (-10.0..10.0),
        }
    }
}
