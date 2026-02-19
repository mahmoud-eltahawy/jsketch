use bevy::color::palettes::css::GREEN;
use bevy::prelude::*;
use crossbeam_channel::{Receiver, Sender, bounded};
use mlua::{Function, Lua};
use notify::event::{CreateKind, DataChange, ModifyKind};
use notify::{EventKind, Watcher};
use std::ops::Range;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
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
struct ProjectPath(PathBuf);

fn prepare_engine(sender: Arc<Sender<ShapeCommand>>, start: Instant) -> Lua {
    let lua = Lua::new();
    let globals = lua.globals();

    let sender2 = sender.clone();
    let sender3 = sender.clone();
    let sender4 = sender.clone();
    let sender5 = sender.clone();
    let sender6 = sender.clone();
    let sender7 = sender.clone();
    let sin_shape = lua
        .create_function(
            move |_, (amplitude, frequency, range_begin, range_end): (f32, f32, f32, f32)| {
                let ss = SinShape::new(amplitude, frequency, range_begin..range_end);
                let shape = Shape::sin(ss, start);
                let id = shape.id;
                let ss = ShapeCommand::Register(shape);
                sender2.send(ss).unwrap();
                Ok(id)
            },
        )
        .unwrap();
    globals.set("sin_shape", sin_shape).unwrap();
    let circle_shape = lua
        .create_function(move |_, radius| {
            let ss = Circle { radius: radius };
            let shape = Shape::circle(ss, start);
            let id = shape.id;
            let ss = ShapeCommand::Register(shape);
            sender3.send(ss).unwrap();
            Ok(id)
        })
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
            sender5.send(ShapeCommand::Register(shape)).unwrap();
            Ok(id)
        })
        .unwrap();
    globals.set("f_shape", f_shape).unwrap();

    let draw = lua
        .create_function(move |_, id: u128| {
            sender6
                .send(ShapeCommand::DrawAfter { id, milis: 0 })
                .unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("draw", draw).unwrap();

    let transiton = lua
        .create_function(move |_, (id, x, y, z): (u128, f32, f32, f32)| {
            sender7
                .send(ShapeCommand::Transition {
                    id,
                    target: Vec3 { x, y, z },
                })
                .unwrap();
            Ok(())
        })
        .unwrap();
    globals.set("transition", transiton).unwrap();

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
    Register(Shape),
    DrawAfter { id: u128, milis: u64 },
    Transition { id: u128, target: Vec3 },
    ClearShapeWithId(usize),
}

#[derive(Debug)]
struct Shape {
    id: u128,
    instant: Instant,
    draw_after: Option<Duration>,
    draw_progress: usize,
    center: Vec3,
    verts: Vec<Vec3>,
    form: ShapeForm,
}

impl Shape {
    fn new(form: ShapeForm, start: Instant) -> Self {
        let instant = Instant::now();
        let id = instant.duration_since(start).as_nanos();
        let verts = match &form {
            ShapeForm::Sin(shape) => shape.points(Vec3::ZERO),
            ShapeForm::Circle(shape) => shape.points(Vec3::ZERO),
            ShapeForm::FShape(shape) => shape.points(Vec3::ZERO),
        };
        Self {
            id,
            instant,
            verts,
            form,
            draw_after: None,
            draw_progress: 0,
            center: Vec3::ZERO,
        }
    }
    fn retransition(&mut self) {
        for v in self.verts.iter_mut() {
            *v = *v + self.center;
        }
    }
    fn sin(s: SinShape, start: Instant) -> Self {
        let form = ShapeForm::Sin(s);
        Self::new(form, start)
    }

    fn circle(s: Circle, start: Instant) -> Self {
        let form = ShapeForm::Circle(s);
        Self::new(form, start)
    }

    fn f(form: FShape, start: Instant) -> Shape {
        let form = ShapeForm::FShape(form);
        Self::new(form, start)
    }
}

#[derive(Debug)]
enum ShapeForm {
    Sin(SinShape),
    Circle(Circle),
    FShape(FShape),
}

#[derive(Resource, Default)]
struct Shapes(Vec<Shape>);

const SHAPE_RESOLOUTION: usize = 400;

fn draw_shapes(mut gizmos: Gizmos, mut shapes: ResMut<Shapes>) {
    for shape in &mut shapes.0 {
        gizmos.linestrip(shape.verts[0..shape.draw_progress].to_vec(), GREEN);
        let Some(df) = shape.draw_after else {
            continue;
        };
        if shape.instant.elapsed() < df {
            continue;
        };
        if shape.draw_progress >= SHAPE_RESOLOUTION {
            continue;
        }
        shape.draw_progress += 1;
    }
}

fn execute_shape_command(mut shapes: ResMut<Shapes>, reciver: Res<ShapeReciver>) {
    for shape in reciver.0.try_iter() {
        match shape {
            ShapeCommand::ClearAll => {
                shapes.0.clear();
            }
            ShapeCommand::Register(shape) => {
                shapes.0.push(shape);
            }
            ShapeCommand::ClearShapeWithId(id) => {
                shapes.0.retain(|x| x.id != id as u128);
            }
            ShapeCommand::DrawAfter { id, milis } => {
                let i = shapes.0.iter().position(|x| x.id == id);
                let Some(i) = i else {
                    continue;
                };
                let shape = shapes.0.get_mut(i);
                let Some(shape) = shape else {
                    continue;
                };
                shape.draw_after = Some(Duration::from_millis(milis));
            }
            ShapeCommand::Transition { id, target } => {
                let i = shapes.0.iter().position(|x| x.id == id);
                let Some(i) = i else {
                    continue;
                };
                let shape = shapes.0.get_mut(i);
                let Some(shape) = shape else {
                    continue;
                };
                shape.center += target;
                shape.retransition();
            }
        }
    }
}

#[derive(Debug)]
struct SinShape {
    amplitude: f32,
    frequency: f32,
    range: Range<f32>,
}

trait Points {
    fn point_closure(&self) -> Box<dyn Fn(usize) -> Vec3>;
    fn points(&self, transiton: Vec3) -> Vec<Vec3> {
        (0..SHAPE_RESOLOUTION)
            .into_iter()
            .map(self.point_closure())
            .map(|p| p + transiton)
            .collect::<Vec<_>>()
    }
}

impl Points for SinShape {
    fn point_closure(&self) -> Box<dyn Fn(usize) -> Vec3> {
        let start = self.range.start;
        let end = self.range.end;
        let amp = self.amplitude;
        let freq = self.frequency;
        let f = move |draw_progress: usize| {
            let x = start.lerp(end, draw_progress as f32 / SHAPE_RESOLOUTION as f32);
            let y = amp * (x * freq).sin();
            Vec3 { x: x, y, z: 0.0 }
        };
        Box::new(f)
    }
}

impl Points for FShape {
    fn point_closure(&self) -> Box<dyn Fn(usize) -> Vec3> {
        let start = self.range.start;
        let end = self.range.end;
        let fun = self.fun.clone();
        let f = move |draw_progress: usize| {
            let x = start.lerp(end, draw_progress as f32 / SHAPE_RESOLOUTION as f32);
            let y = fun.call::<f32>(x).unwrap();
            Vec3 { x: x, y, z: 0.0 }
        };
        Box::new(f)
    }
}

impl Points for Circle {
    fn point_closure(&self) -> Box<dyn Fn(usize) -> Vec3> {
        const END: f32 = 360.0;
        let radius = self.radius;
        let f = move |draw_progress: usize| {
            let angle = 0.0.lerp(END, draw_progress as f32 / SHAPE_RESOLOUTION as f32);
            let x = radius * angle.cos();
            let y = radius * angle.sin();
            Vec3 { x: x, y, z: 0.0 }
        };
        Box::new(f)
    }
}

#[derive(Debug)]
struct FShape {
    fun: Function,
    range: Range<f32>,
}
impl FShape {
    fn new(fun: Function, begin: f32, end: f32) -> Self {
        Self {
            fun,
            range: begin..end,
        }
    }
}

impl SinShape {
    fn new(amplitude: f32, frequency: f32, range: Range<f32>) -> Self {
        Self {
            amplitude,
            frequency,
            range,
        }
    }
}

impl Default for SinShape {
    fn default() -> Self {
        let start = -10.0;
        Self {
            amplitude: 3.,
            frequency: 3.,
            range: (start..10.0),
        }
    }
}
