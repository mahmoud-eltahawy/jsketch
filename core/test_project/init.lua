
clear_all_shapes()
local sid = sin_shape(1, 1, 0, 8)
circle_shape(2, 1, 1, 1, 1)
circle_shape(4, 1, 1, 1, 3)
circle_shape(9, 1, 1, 1, 6)
clear_shape(sid)
f_shape(function (x) 
 return x * x;
end, 0.0, 4.0)
