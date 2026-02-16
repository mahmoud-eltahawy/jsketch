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
        let (tx, rx) = bounded::<Shape>(100);
        app.init_resource::<Shapes>()
            .insert_resource(ShapeReciver(rx))
            .insert_resource(ShapeSender(tx))
            .add_systems(
                Update,
                (animate_shapes, re_execute_the_script, animate_new_shapes),
            );
    }
}

fn re_execute_the_script(keys: Res<ButtonInput<KeyCode>>, sender: Res<ShapeSender>) {
    if keys.just_pressed(KeyCode::Enter) {
        execute_script(sender.0.clone());
    }
}

fn execute_script(sender: Sender<Shape>) {
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

    let sender2 = sender.clone();
    let sender3 = sender.clone();
    engine.register_fn(
        "SinShape",
        move |amplitude: i64, frequency: i64, range_begin: i64, range_end: i64| {
            let ss = SinShape {
                begin: Instant::now(),
                verts: Vec::new(),
                amplitude: amplitude as f32,
                frequency: frequency as f32,
                range: range_begin as f32..range_end as f32,
            };
            sender2.send(Shape::Sin(dbg!(ss))).unwrap();
        },
    );
    engine.register_fn(
        "CircleShape",
        move |radius: i64, x: i64, y: i64, z: i64, speed: i64| {
            let ss = CircleShape {
                begin: Instant::now(),
                angle: 0.0,
                radius: radius as f32,
                center: Vec3 {
                    x: x as f32,
                    y: y as f32,
                    z: z as f32,
                },
                speed: speed as f32,
            };
            sender3.send(Shape::Circle(dbg!(ss))).unwrap();
        },
    );
    engine.register_fn("ClearShapes", move || {
        sender.send(Shape::Clear).unwrap();
    });

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
    Clear,
}

#[derive(Resource, Default)]
struct Shapes(Vec<Shape>);

#[derive(Debug)]
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

fn animate_new_shapes(mut shapes: ResMut<Shapes>, reciver: Res<ShapeReciver>) {
    for shape in reciver.0.try_iter() {
        match shape {
            Shape::Clear => {
                shapes.0.clear();
            }
            shape => {
                shapes.0.push(shape);
            }
        }
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
        Shape::Clear => (),
    }
}

#[derive(Debug)]
struct SinShape {
    begin: Instant,
    verts: Vec<Vec3>,
    amplitude: f32,
    frequency: f32,
    range: Range<f32>,
}

impl SinShape {}

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
