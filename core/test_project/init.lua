
function sleep(n)
    os.execute("sleep " .. tonumber(n))
end

-- local sid = sin_shape(1, 1, 0, 8)
-- draw(sid)
-- local cid =circle_shape(2)
-- transition(cid,3,0,0)
-- draw(cid)
-- sleep(1)
-- local from =circle_shape(4) 
-- draw(from)
-- sleep(4)
-- draw(to)
-- local to = circle_shape(9)
-- convert_shape(from,to)
-- clear_shape(sid)
clear_all_shapes()
local fst =f_shape(function (x)
 return x * x;
end, -4.0, 4.0)

local snd =circle_shape(3)
local third =f_shape(function (x)
  return x * x * x
end,-2.0,3.0)

local rect = rectangle_shape(5, 3)
transition(rect,2,2,3)

draw(fst)

sleep(3)

local cv = convert_shape(fst,snd)
sleep(5)
convert_shape(cv,rect)
