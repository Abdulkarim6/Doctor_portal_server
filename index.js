const express = require("express");
const app = express();
const cors = require("cors");
require('dotenv').config();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.6ertblk.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true, } });

async function run() {
    try {
        const appointmentOptionsCollection = client.db("newDoctorsPortal").collection("appointmentOptions");
        const bookingsCollection = client.db("newDoctorsPortal").collection("bookings");

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

        app.post('/bookings', async (req, res) => {
            const booking = req.body;

            const query = {
                patientEmail: booking.patientEmail,
                appointmentDate: booking.appointmentDate,
                treatmentName: booking.treatmentName,
            }
            const allreadyTreatmentBooked = await bookingsCollection.find(query).toArray();
            console.log(allreadyTreatmentBooked);
            if (allreadyTreatmentBooked?.length > 0) {
                const message = `you have allready booked on ${booking?.treatmentName} treatment for this ${booking?.appointmentDate} date`
                res.send({ acknowledged: false, message })
            } else {
                const result = await bookingsCollection.insertOne(booking);
                res.send(result)
            }
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
    console.log(`hospital server code running on ${port} `);
})
