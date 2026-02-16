use bevy::color::palettes::css::{GREEN, RED};
use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender, bounded};
use std::fs;
use std::ops::Range;
use std::path::PathBuf;
use std::time::Instant;
use steel::steel_vm::engine::Engine;
use steel::steel_vm::register_fn::RegisterFn;

pub struct ShapesPlugin;

impl Plugin for ShapesPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, prepare_channels)
            .init_resource::<Shapes>()
            .add_systems(
                Update,
                (animate_shapes, re_execute_the_script, animate_new_shapes),
            );
    }
}

fn prepare_channels(mut commands: Commands) {
    let (tx, rx) = bounded::<Shape>(1);
    commands.insert_resource(ShapeReciver(rx));
    commands.insert_resource(ShapeSender(tx));
}

fn re_execute_the_script(keys: Res<ButtonInput<KeyCode>>, sender: Res<ShapeSender>) {
    if keys.just_pressed(KeyCode::Enter) {
        sender
            .0
            .send(Shape::Circle(CircleShape {
                radius: 5.,
                ..CircleShape::default()
            }))
            .unwrap();
        execute_script();
    }
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

#[derive(Resource)]
struct ShapeReciver(Receiver<Shape>);

#[derive(Resource)]
struct ShapeSender(Sender<Shape>);

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
        handle_shape(&mut gizmos, shape);
    }
}

fn animate_new_shapes(mut gizmos: Gizmos, mut shapes: ResMut<Shapes>, reciver: Res<ShapeReciver>) {
    for shape in reciver.0.try_iter() {
        shapes.0.push(shape);
        let mut shape = shapes.0.last_mut().unwrap();
        handle_shape(&mut gizmos, &mut shape);
    }
}

fn handle_shape(gizmos: &mut Gizmos<'_, '_>, shape: &mut Shape) {
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
