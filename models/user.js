const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');


const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide fullname']
    },
    phone: {
        type: String,
        required: [true, 'Please provide phone number'],
        unique: true,
        trim: true
    },

    email: {
        type: String,
        required: [true, 'Please provide email address'],
        validate: [validator.isEmail, 'Please provide a valid email address'],
        unique: true,
        lowercase: true,
        trim: true
    },

    password: {
        type: String,
        required: [true, 'Please provide  password'],
        minlength: [8, 'The password field must be at least 8 characters.'],
        select: false
    },
    passwordConfirm: {
        type: String,
        required: [true, 'Please confirm  password'],
        validate: {
            validator: function (el) {
                return el === this.password;
            },
            message: 'The password field confirmation does not match.'
        }
    },
    photo: {
        type: String,
        default:`${process.env.APP_URL}/uploads/users/default.jpg`
    },
    role: {
        type: String,
        enum: {
            values: ['admin', 'cashier'],
            message: 'Role is either: admin or cashier. Got {VALUE}'
        },
        default: 'cashier'
    },

    status: {
        type: String,
        enum: {
            values: ['active', 'deactivated', 'pending'],
            message: 'Status is either: active, deactivated or pending. Got {VALUE}'
        },
        default: 'active'
    },
    active:{
        type:Boolean,
        default:true
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,

}, { timestamps: true })


// Pre-save middleware to hash password
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
    this.passwordConfirm = undefined;
});


// Pre-save middleware for passwordChangedAt
userSchema.pre('save', function () {
    if (!this.isModified('password') || this.isNew) return;
    this.passwordChangedAt = Date.now() - 1000;
});


// Method to compare passwords
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};



// Method to check if password was changed after token was issued
userSchema.methods.changedPasswordAfter = function (JWTtime) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        return JWTtime < changedTimestamp;
    }
    return false;
};

// Method to create password reset token
userSchema.methods.createPasswordResetToken = function () {
    const resetToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    return resetToken;
};

const User = mongoose.model('User', userSchema);
module.exports = User;