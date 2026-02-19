use bevy::color::palettes::css::{GREEN, RED};
use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender, bounded};
use mlua::{Function, Lua};
use notify::event::{CreateKind, DataChange, ModifyKind};
use notify::{EventKind, Watcher};
use std::ops::Range;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use std::{env, fs, thread};

pub struct ShapesPlugin;

impl Plugin for ShapesPlugin {
    fn build(&self, app: &mut App) {
        let (tx, rx) = bounded::<ShapeCommand>(100);
        let tx = Arc::new(tx);
        let start = Instant::now();
        let engine = prepare_engine(tx.clone(), start);
        let path = program_path();
        app.init_resource::<Shapes>()
            .insert_resource(ShapeReciver(rx))
            .insert_resource(Start(start))
            .insert_resource(ProjectPath(path))
            .insert_resource(Vm(engine))
            .add_systems(
                Update,
                (
                    script_system.run_if(run_once),
                    draw_shapes,
                    execute_shape_command,
                ),
            );
    }
}

const ENTRY_SCRIPT_NAME: &str = "init.lua";

#[derive(Resource)]
struct Vm(Lua);

fn script_system(vm: Res<Vm>, program_path: Res<ProjectPath>) {
    let path = program_path.0.clone();
    let path = path.canonicalize().unwrap();
    let engine = vm.0.clone();
    thread::spawn(move || {
        let is_dir = path.is_dir();
        let (tx, rx) = bounded::<notify::Result<notify::Event>>(1);

        let mut project_watcher =
            notify::recommended_watcher(tx).expect("can not watch file changes");

        let watch_path = if is_dir {
            path.clone()
        } else {
            path.parent().unwrap().to_path_buf()
        };

        project_watcher
            .watch(&watch_path, notify::RecursiveMode::NonRecursive)
            .unwrap();

        for event in rx.iter() {
            let Ok(event) = event else {
                continue;
            };
            if let EventKind::Modify(ModifyKind::Data(DataChange::Any))
            | EventKind::Create(CreateKind::File) = event.kind
            {
                if !watch_path.exists() {
                    eprintln!(
                        "Error : project source directory path {watch_path:#?} does not exist"
                    );
                    return;
                }
                let pwd = env::current_dir().unwrap();
                env::set_current_dir(&watch_path).unwrap();
                let entry_script = if is_dir {
                    watch_path.join(ENTRY_SCRIPT_NAME)
                } else {
                    path.clone()
                };
                let script = fs::read_to_string(&entry_script).unwrap();
                println!("Executing: {}\n", entry_script.display());
                if let Err(err) = engine.load(script).exec() {
                    dbg!(err);
                };
                env::set_current_dir(pwd).unwrap();
            }
        }
    });
}

#[derive(Resource)]
struct Start(Instant);

#[derive(Resource)]
struct ProjectPath(PathBuf);

fn prepare_engine(sender: Arc<Sender<ShapeCommand>>, start: Instant) -> Lua {
    let lua = Lua::new();
    let globals = lua.globals();

    let sender2 = sender.clone();
    let sender3 = sender.clone();
    let sender4 = sender.clone();
    let sender5 = sender.clone();
    let sin_shape = lua
        .create_function(
            move |_, (amplitude, frequency, range_begin, range_end): (f32, f32, f32, f32)| {
                let ss = SinShape::new(amplitude, frequency, range_begin..range_end);
                let shape = Shape::sin(ss, start);
                let id = shape.id;
                let ss = ShapeCommand::Draw(shape);
                sender2.send(ss).unwrap();
                Ok(id)
            },
        )
        .unwrap();
    globals.set("sin_shape", sin_shape).unwrap();
    let circle_shape = lua
        .create_function(
            move |_, (radius, x, y, z, speed): (f32, f32, f32, f32, f32)| {
                let ss = CircleShape {
                    angle: 0.0,
                    radius: radius,
                    center: Vec3 { x: x, y: y, z: z },
                    speed: (speed % 100.0) / 100.0,
                };
                let shape = Shape::circle(ss, start);
                let id = shape.id;
                let ss = ShapeCommand::Draw(shape);
                sender3.send(ss).unwrap();
                Ok(id)
            },
        )
        .unwrap();
    globals.set("circle_shape", circle_shape).unwrap();

    let clear_shape = lua
        .create_function(move |_, id: usize| {
            sender4.send(ShapeCommand::ClearShapeWithId(id)).unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("clear_shape", clear_shape).unwrap();

    let f_shape = lua
        .create_function(move |_, (fun, begin, end): (Function, f32, f32)| {
            let shape = Shape::f(FShape::new(fun, begin, end), start);
            let id = shape.id;
            sender5.send(ShapeCommand::Draw(shape)).unwrap();
            Ok(id)
        })
        .unwrap();
    globals.set("f_shape", f_shape).unwrap();

    let clear_all_shapes = lua
        .create_function(move |_, ()| {
            sender.send(ShapeCommand::ClearAll).unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("clear_all_shapes", clear_all_shapes).unwrap();

    lua
}

fn program_path() -> PathBuf {
    let mut args = env::args();
    let project_path = args.next().expect("program must exist!!");
    match args.next().and_then(|x| x.parse::<PathBuf>().ok()) {
        Some(path) => path,
        None => {
            eprintln!("Usage: {} <script.scm>", project_path);
            std::process::exit(1);
        }
    }
}

#[derive(Resource)]
struct ShapeReciver(Receiver<ShapeCommand>);

enum ShapeCommand {
    ClearAll,
    Draw(Shape),
    ClearShapeWithId(usize),
}

#[derive(Debug)]
struct Shape {
    id: u128,
    instant: Instant,
    form: ShapeForm,
}

impl Shape {
    fn sin(s: SinShape, start: Instant) -> Self {
        let form = ShapeForm::Sin(s);
        let instant = Instant::now();
        let id = instant.duration_since(start).as_nanos();
        Self { id, instant, form }
    }

    fn circle(s: CircleShape, start: Instant) -> Self {
        let form = ShapeForm::Circle(s);
        let instant = Instant::now();
        let id = instant.duration_since(start).as_nanos();
        Self { id, instant, form }
    }

    fn f(form: FShape, start: Instant) -> Shape {
        let form = ShapeForm::FShape(form);
        let instant = Instant::now();
        let id = instant.duration_since(start).as_nanos();
        Self { id, instant, form }
    }
}

#[derive(Debug)]
enum ShapeForm {
    Sin(SinShape),
    Circle(CircleShape),
    FShape(FShape),
}

#[derive(Resource, Default)]
struct Shapes(Vec<Shape>);

#[derive(Debug)]
struct CircleShape {
    angle: f32,
    radius: f32,
    center: Vec3,
    speed: f32,
}

impl Default for CircleShape {
    fn default() -> Self {
        Self {
            angle: 0.,
            radius: 2.,
            center: Vec3::ZERO,
            speed: 60.,
        }
    }
}

fn draw_shapes(mut gizmos: Gizmos, mut shapes: ResMut<Shapes>) {
    for shape in &mut shapes.0 {
        match &mut shape.form {
            ShapeForm::Sin(ss) => {
                ss.x = ss.x.lerp(ss.range.end, 0.01);
                let y = ss.amplitude * (ss.x * ss.frequency).sin();
                ss.verts.push(Vec3 { x: ss.x, y, z: 0.0 });
                gizmos.linestrip(ss.verts.clone(), GREEN);
            }
            ShapeForm::Circle(cs) => {
                cs.angle = cs.angle.lerp(360.0, cs.speed);

                gizmos
                    .arc_3d(
                        cs.angle.to_radians(),
                        cs.radius,
                        Isometry3d::new(cs.center, Quat::from_rotation_x(90.)),
                        RED,
                    )
                    .resolution(1000);
            }
            ShapeForm::FShape(fshape) => {
                let fun = fshape.fun.clone();
                let x = fshape.begin;
                fshape.begin = fshape.begin.lerp(fshape.end, fshape.speed);
                let y = fun.call::<f32>(x);
                if let Ok(y) = y {
                    fshape.verts.push(Vec3 { x, y, z: 0.0 });
                }
                gizmos.linestrip(fshape.verts.clone(), GREEN);
            }
        }
    }
}

fn execute_shape_command(mut shapes: ResMut<Shapes>, reciver: Res<ShapeReciver>) {
    for shape in reciver.0.try_iter() {
        match shape {
            ShapeCommand::ClearAll => {
                shapes.0.clear();
            }
            ShapeCommand::Draw(shape) => {
                shapes.0.push(shape);
            }
            ShapeCommand::ClearShapeWithId(id) => {
                shapes.0.retain(|x| x.id != id as u128);
            }
        }
    }
}

#[derive(Debug)]
struct SinShape {
    verts: Vec<Vec3>,
    amplitude: f32,
    frequency: f32,
    range: Range<f32>,
    x: f32,
}

#[derive(Debug)]
struct FShape {
    verts: Vec<Vec3>,
    fun: Function,
    speed: f32,
    begin: f32,
    end: f32,
}
impl FShape {
    fn new(fun: Function, begin: f32, end: f32) -> Self {
        Self {
            fun,
            verts: Vec::new(),
            begin,
            end,
            speed: 0.1,
        }
    }
}

impl SinShape {
    fn new(amplitude: f32, frequency: f32, range: Range<f32>) -> Self {
        Self {
            verts: Vec::new(),
            amplitude,
            frequency,
            x: range.start,
            range,
        }
    }
}

impl Default for SinShape {
    fn default() -> Self {
        let start = -10.0;
        Self {
            verts: Default::default(),
            amplitude: 3.,
            frequency: 3.,
            x: start,
            range: (start..10.0),
        }
    }
}
