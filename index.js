const express = require("express");
const app = express();
const cors = require("cors");
require('dotenv').config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.6ertblk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true, } });

//get access token from client code and verify jwt token
function verifyJwt(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" })
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "forbidden access" })
        }
        req.decoded = decoded;
        next()
    })
}

async function run() {
    try {
        const appointmentOptionsCollection = client.db("newDoctorsPortal").collection("appointmentOptions");
        const bookingsCollection = client.db("newDoctorsPortal").collection("bookings");
        const usersCollection = client.db("newDoctorsPortal").collection("users");
        const doctorsCollection = client.db("newDoctorsPortal").collection("doctors");
        const paymentsCollection = client.db("newDoctorsPortal").collection("payments");

        //verify admin with middleware || Make sure verifyJwt then after verifyAdmin
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden Access' })
            }
            next()
        }

        //load available treatment options from database and send client side
        app.get("/appointmentOptions", async (req, res) => {
            const query = {}
            const date = req.query.date;
            const avilableOptions = await appointmentOptionsCollection.find(query).toArray();

            const bookingsTodayQuery = { appointmentDate: date }
            const allreadyBookedsTodayDate = await bookingsCollection.find(bookingsTodayQuery).toArray();

            avilableOptions.forEach(avilableOption => {
                const optionBooked = allreadyBookedsTodayDate.filter(bookedToday => bookedToday.treatmentName === avilableOption.name);
                const optionBookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = avilableOption.slots.filter(slot => !optionBookedSlots.includes(slot))

                avilableOption.slots = remainingSlots;
            })

            res.send(avilableOptions)
        });
        //  booking appointment a user from client side and send database
        app.post('/bookings', verifyJwt, async (req, res) => {
            const booking = req.body;

            const query = {
                patientEmail: booking.patientEmail,
                appointmentDate: booking.appointmentDate,
                treatmentName: booking.treatmentName,
            }
            const allreadyTreatmentBooked = await bookingsCollection.find(query).toArray();
            if (allreadyTreatmentBooked?.length > 0) {
                const message = `you have allready booked on ${booking?.treatmentName} treatment for this ${booking?.appointmentDate} date`
                return res.send({ acknowledged: false, message })
            } else {
                const result = await bookingsCollection.insertOne(booking);
                res.send(result)
            }
        });

        //load a user appointments(my appointment) from database and send client side
        app.get("/patientAppointments", verifyJwt, async (req, res) => {
            const email = req.query.email;
            const date = req.query.date;
            console.log(email,date);
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: "forbidden access" })
            };

            console.log(email,date,decodedEmail);
            const filterOnDate = {
                patientEmail: email,
                appointmentDate: date,
            };

            const query = { patientEmail: email };
            const patientAppointments = await bookingsCollection.find(query).toArray();
            const patientAppointmentsOnDate = await bookingsCollection.find(filterOnDate).toArray();
           
            res.send([patientAppointments.reverse(), patientAppointmentsOnDate]);
        });

        //get perticuler appointment from db
        app.get('/appointment/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await bookingsCollection.findOne(query);
            res.send(result);
        })

        //post user data from client side to database
        app.post('/user', async (req, res) => {
            const query = req.body;
            //checking for a user signup or sign in with google the user data store or not!
            const email = query.email;
            const queryEmail = { email: email };
            const allReadyUserSignUp = await usersCollection.findOne(queryEmail);
            if (allReadyUserSignUp) {
                return res.send({ isAllReadyFoundData: 'AllReadyFoundData' })
            }

            const result = await usersCollection.insertOne(query);
            res.send(result);
        });

        //get alluser data from database and send client side
        app.get('/users', verifyJwt, verifyAdmin, async (req, res) => {
            const query = {};
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        });

        //deleta a user from DB action to client code
        app.delete('/user', verifyJwt, verifyAdmin, async (req, res) => {
            const id = req.query._id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result)
        })

        //Make admin a user
        app.put('/users/makeAdmin/:id', verifyJwt, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        //temporary create price role in bookingsCollection and appointmentOptionsCollection
        // app.get('/price', async (req, res) => {
        //     const filter = {};
        //     const options = { upsert: true };
        //     const updateDoc = {
        //         $set: {
        //             price: 99
        //         },
        //     };
        //     const result = await appointmentOptionsCollection.updateMany(filter, updateDoc, options);
        //     res.send(result)

        // })

        //check user admin?
        app.get('/users/checkIsAdmin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            return res.send({ isAdmin: user?.role === 'admin' })
        });

        //only get specialties from appointmentOptionsCollection(DB) use project({ name: 1 })
        app.get('/specialties', async (req, res) => {
            const query = {}
            const result = await appointmentOptionsCollection.find(query).project({ name: 1 }).toArray();
            res.send(result)
        });

        //post doctor data to DB from client code
        app.post("/doctor", verifyJwt, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        });

        //get doctors data from DB and send client code
        app.get('/doctors', verifyJwt, verifyAdmin, async (req, res) => {
            const query = {}
            const result = await doctorsCollection.find(query).toArray();
            res.send(result)
        });

        //deleta a doctor from DB action to client code
        app.delete('/doctor', verifyJwt, verifyAdmin, async (req, res) => {
            const id = req.query._id;
            const query = { _id: new ObjectId(id) };
            const result = await doctorsCollection.deleteOne(query);
            res.send(result)
        });

        //STRIPE process
        app.post("/create-payment-intent", async (req, res) => {
            const appoint = req.body;
            const price = appoint.price;
            const amount = price * 100

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                "payment_method_types": [
                    "card"
                ],
            })
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        //payment data get from client code and send db
        app.post("/payment", async (req, res) => {
            const paymentData = req.body;
            const result = await paymentsCollection.insertOne(paymentData);

            const id = paymentData.appopintmentId;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    paid: true,
                    paymentId: paymentData.paymentId,
                },
            };
            const updateResult = await bookingsCollection.updateOne(filter, updateDoc)
            res.send(result)
        })

        // if a user signIn or signUp by email, Then he will get a token and use this token client side
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN);
                return res.send({ accessToken: token });
            }
            res.status(403).send({ accessToken: '' });
        })

    }
    finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(err => console.error(err));



app.get('/', (req, res) => {
    res.send("Hospital server code start")
});

app.listen(port, () => {
    console.log(`hospital server is running on ${port} `);
})
