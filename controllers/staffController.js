const crypto = require("crypto");
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");
const User = require("../models/user");

// GET /api/staff
exports.getAllStaff = catchAsync(async (req, res, next) => {
    const staff = await User.find().sort({ createdAt: -1 });

    res.status(200).json({
        status: "success",
        results: staff.length,
        data: { staff },
    });
});

// POST /api/staff
// Creates a new staff account with a temporary auto-generated password
exports.createStaff = catchAsync(async (req, res, next) => {
    const { name, email, phone, role } = req.body;

    // Generate a temporary password — shown once to the admin so they can share it
    const tempPassword = crypto.randomBytes(4).toString("hex"); // e.g. "a1b2c3d4"

    const newStaff = await User.create({
        name,
        email: email.toLowerCase(),
        phone,
        role: role === "admin" ? "admin" : "cashier",
        password: tempPassword,
        passwordConfirm: tempPassword, // schema requires this to match on create
        status: "active",
        active: true,
    });

    // password has select:false so it won't be on this doc anyway, but be explicit
    newStaff.password = undefined;

    res.status(201).json({
        status: "success",
        data: {
            staff: newStaff,
            tempPassword, // returned once — frontend shows it, then discards it
        },
    });
});

// PATCH /api/staff/:id/toggle-status
// Activates or deactivates a staff account
exports.toggleStaffStatus = catchAsync(async (req, res, next) => {
    const staff = await User.findById(req.params.id);

    if (!staff) {
        return next(new AppError("Staff member not found.", "", 404));
    }

    // Prevent an admin from disabling their own account by accident
    if (staff._id.toString() === req.user._id.toString()) {
        return next(new AppError("You cannot disable your own account.", "", 400));
    }

    // If this is an active admin, make sure they're not the last one —
    // disabling the only admin would lock everyone out of admin features
    if (staff.role === "admin" && staff.status === "active") {
        const activeAdminCount = await User.countDocuments({ role: "admin", status: "active" });
        if (activeAdminCount <= 1) {
            return next(new AppError("This is the only active admin account and cannot be disabled.", "", 403));
        }
    }

    const isCurrentlyActive = staff.status === "active";
    staff.status = isCurrentlyActive ? "deactivated" : "active";
    staff.active = !isCurrentlyActive;
    await staff.save({validateBeforeSave:false});

    res.status(200).json({
        status: "success",
        message: `${staff.name}'s account has been ${staff.active ? "enabled" : "disabled"}.`,
        data: { staff },
    });
});