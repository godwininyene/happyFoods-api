const express = require('express')
const app = express();
const path = require('path')
const cors = require('cors');
const cookieParser = require('cookie-parser')
const AppError = require('./utils/appError')
const globalErrorController = require('./controllers/errorController')
const userRouter = require('./routes/userRoutes')
const inventoryBatchRouter = require('./routes/inventoryRoutes')
const productRouter = require('./routes/productRoutes')
const salesRouter = require("./routes/salesRoutes");
const debtorRouter = require("./routes/debtorRoutes");
const analyticsRouter = require("./routes/analyticsRoutes");
const staffRouter = require("./routes/staffRoutes");
const categoryRouter = require("./routes/categoryRoutes");




//Implement cors
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true, // Allow credentials such as cookies
}));

// app.options('*', cors())
app.options('/*splat', cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
}));


//Body parser, read data from req.body into body
app.use(express.json());
app.use(cookieParser())
//Serve static files
app.use(express.static(path.join(__dirname, 'public')))


//Mount routers
app.use('/api/v1/users', userRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/inventory', inventoryBatchRouter)
app.use("/api/v1/sales", salesRouter);
app.use("/api/v1/debtors", debtorRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/staff", staffRouter);
app.use("/api/v1/categories", categoryRouter);


//Not found route
app.use('/*splat',(req, res, next) => {
    next(new AppError(`The requested URL ${req.originalUrl} was not found on this server!`,'', 404));
});

//Global error router
app.use(globalErrorController)

module.exports = app