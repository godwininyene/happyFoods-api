const User = require("../models/user");
const catchAsync = require("../utils/catchAsync");
const AppError = require('./../utils/appError')


const filterObj = (obj, ...allowFields) => {
    const newObj = {};
    Object.keys(obj).forEach(key => {
        if (allowFields.includes(key)) newObj[key] = obj[key]
    });

    return newObj
}


exports.createUser = catchAsync(async (req, res, next) => {
    const user = await User.create(req.body)

    res.status(201).json({
        status: "success",
        data: {
            user
        }
    })
});



exports.getUser = catchAsync(async (req, res, next) => {
    const user = await User.findById(req.params.id)
    if (!user) {
        return next(new AppError("No user found with that ID", '', 404))
    }
    res.status(200).json({
        status: "success",
        data: {
            user
        }
    })
});


exports.getMe = (req, res, next) => {
    req.params.id = req.user._id;
    next();
}

exports.updateMe = catchAsync(async (req, res, next) => { 
    // 1) Create an error if user trys to update password field
    if (req.body.password || req.body.passwordConfirm) {
        return next(new AppError("This route is not for password updates, please use /updateMyPassword", '', 401));
    }

    // 2) Remove unwanted fields that are not allowed to be updated
    const filterBody = filterObj(req.body, 'name', 'email', 'phone');


    //3) Update the user document
    const updatedUser = await User.findByIdAndUpdate(req.user._id, filterBody, {
        new: true,
        runValidators: true
    });
    res.status(200).json({
        status: "success",
        data: {
            user: updatedUser
        }
    })
});

