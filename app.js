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
const axios = require('axios')




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


app.post("/api/location", async (req, res) => {
    try {

        const {
            latitude,
            longitude,
            accuracy
        } = req.body;

        // console.log("Coordinates received:", req.body);

        const response = await axios.get(
            "https://api.geoapify.com/v1/geocode/reverse",
            {
                params: {
                    lat: latitude,
                    lon: longitude,
                    apiKey: process.env.GEOAPIFY_API_KEY
                }
            }
        );

        const result = response.data.features[0];

        console.log('RESULT', result);
        

        res.json({
            success: true,

            coordinates: {
                latitude,
                longitude,
                accuracy
            },

            address: {
                formatted: result.properties.formatted,
                country: result.properties.country,
                state: result.properties.state,
                city:
                    result.properties.city ||
                    result.properties.town ||
                    result.properties.village,

                suburb: result.properties.suburb,
                postcode: result.properties.postcode
            }
        });

    } catch (err) {

        console.error(err.response?.data || err);

        res.status(500).json({
            success: false,
            message: "Failed to reverse geocode location."
        });

    }
});

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
app.use('/*splat', (req, res, next) => {
    next(new AppError(`The requested URL ${req.originalUrl} was not found on this server!`, '', 404));
});

//Global error router
app.use(globalErrorController)

module.exports = app