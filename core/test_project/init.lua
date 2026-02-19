
clear_all_shapes()
local sid = sin_shape(1, 1, 0, 8)
draw(sid)
local cid =circle_shape(2) 
transition(cid,3,0,0)
draw(cid)
draw(circle_shape(4))
draw(circle_shape(9))
-- clear_shape(sid)
draw(f_shape(function (x) 
 return x * x;
end, 0.0, 4.0))
