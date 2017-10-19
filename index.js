var express = require("express");
var oauth = require("oauth");
var moment = require("moment-timezone");
var ical = require("ical-generator");

var app = express();

var client = new oauth.OAuth(
    "https://api.tripit.com/oauth/request_token",
    "https://api.tripit.com/oauth/access_token",
    process.env.TRIPIT_CONSUMER_KEY,
    process.env.TRIPIT_CONSUMER_SECRET,
    "1.0",
    null,
    "HMAC-SHA1"
);

var calendar = ical({
    name: "TripIt",
    prodId: "//mbmccormick//better-tripit-calendar//EN",
    ttl: 0
});

app.get("/" + process.env.FEED_URL_PATH + "/feed.ics", function (req, res) {
    client.get("https://api.tripit.com/v1/list/trip/format/json?past=false&include_objects=true&page_size=50", process.env.TRIPIT_ACCESS_TOKEN, process.env.TRIPIT_TOKEN_SECRET, function (err, body, data) {
        if (err) {
            console.error(err);
        }

        var data = JSON.parse(body);
        processEvents(data);

        client.get("https://api.tripit.com/v1/list/trip/format/json?past=true&include_objects=true&page_size=50", process.env.TRIPIT_ACCESS_TOKEN, process.env.TRIPIT_TOKEN_SECRET, function (err, body, data) {
            if (err) {
                console.error(err);
            }

            var data = JSON.parse(body);
            processEvents(data);

            res.set("Content-Type", "text/calendar");
            res.send(calendar.toString());
        });
    });
});

app.listen(process.env.PORT || 3000);

function processEvents(data) {
    for (var i = 0; i < data.Trip.length; i++) {
        var trip = data.Trip[i];

        // trip summary
        calendar.createEvent({
            uid: trip.id,
            start: moment(trip.start_date).toDate(),
            end: moment(trip.end_date).add(1, "days").toDate(),
            allDay: true,
            summary: trip.display_name,
            description: "https://www.tripit.com" + trip.relative_url,
            location: trip.primary_location,
            geo: trip.PrimaryLocationAddress.latitude + ";" + trip.PrimaryLocationAddress.longitude
        });

        // activities
        if (data.ActivityObject) {
            var list = friendlyArray(data.ActivityObject);

            for (var j = 0; j < list.length; j++) {
                var activity = list[j];

                if (activity.trip_id == trip.id) {
                    var now = moment();
                    var src = moment.tz(now, activity.StartDateTime.timezone);
                    var dst = moment.tz(now, activity.EndDateTime.timezone);

                    var diff = src.utcOffset() - dst.utcOffset();

                    calendar.createEvent({
                        uid: activity.id,
                        start: friendlyDateTime(activity.StartDateTime),
                        end: moment(friendlyDateTime(activity.EndDateTime)).add(diff, "minutes").toDate(),
                        timezone: activity.StartDateTime.timezone,
                        summary: activity.display_name,
                        description: "https://www.tripit.com" + activity.relative_url + "\n" +
                            "\n" +
                            "Conf. # " + activity.supplier_conf_num + "\n" +
                            "\n" +
                            activity.supplier_name + "\n" +
                            "\n" +
                            moment(friendlyDateTime(activity.StartDateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(activity.StartDateTime)).format("h:mma") + " " + moment().tz(activity.StartDateTime.timezone).format("z") + "\n" +
                            "\n" +
                            moment(friendlyDateTime(activity.EndDateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(activity.EndDateTime)).format("h:mma") + " " + moment().tz(activity.EndDateTime.timezone).format("z") + "\n",
                        location: friendlyLocation(activity.Address, activity),
                        geo: friendlyGeo(activity.Address, activity)
                    });
                }
            }
        }

        // flights
        if (data.AirObject) {
            var list = friendlyArray(data.AirObject);

            for (var j = 0; j < list.length; j++) {
                var flight = list[j];

                if (flight.trip_id == trip.id) {
                    var nestedList = friendlyArray(flight.Segment);

                    for (var k = 0; k < nestedList.length; k++) {
                        var segment = nestedList[k];

                        var now = moment();
                        var src = moment.tz(now, segment.StartDateTime.timezone);
                        var dst = moment.tz(now, segment.EndDateTime.timezone);

                        var diff = src.utcOffset() - dst.utcOffset();

                        calendar.createEvent({
                            uid: segment.id,
                            start: friendlyDateTime(segment.StartDateTime),
                            end: moment(friendlyDateTime(segment.EndDateTime)).add(diff, "minutes").toDate(),
                            timezone: segment.StartDateTime.timezone,
                            summary: segment.marketing_airline_code + segment.marketing_flight_number + " " + segment.start_airport_code + " to " + segment.end_airport_code,
                            description: "https://www.tripit.com" + flight.relative_url + "\n" +
                                "\n" +
                                "Conf. # " + flight.supplier_conf_num + "\n" +
                                "\n" +
                                segment.marketing_airline + " " + segment.marketing_flight_number + "\n" +
                                "\n" +
                                "Depart: " + segment.start_city_name + " (" + segment.start_airport_code + ")\n" +
                                moment(friendlyDateTime(segment.StartDateTime)).format("dddd, MMMM Do") + "\n" +
                                moment(friendlyDateTime(segment.StartDateTime)).format("h:mma") + " " + moment().tz(segment.StartDateTime.timezone).format("z") + "\n" +
                                "\n" +
                                "Arrive: " + segment.end_city_name + " (" + segment.end_airport_code + ")\n" +
                                moment(friendlyDateTime(segment.EndDateTime)).add(diff, "minutes").format("dddd, MMMM Do") + "\n" +
                                moment(friendlyDateTime(segment.EndDateTime)).add(diff, "minutes").format("h:mma") + " " + moment().tz(segment.EndDateTime.timezone).format("z") + "\n",
                            location: segment.start_city_name + " (" + segment.start_airport_code + ")",
                            geo: segment.start_airport_latitude + ";" + segment.start_airport_longitude
                        });
                    }
                }
            }
        }

        // rental cars
        if (data.CarObject) {
            var list = friendlyArray(data.CarObject);

            for (var j = 0; j < list.length; j++) {
                var car = list[j];

                if (car.trip_id == trip.id) {
                    calendar.createEvent({
                        uid: car.id + "PickUp",
                        start: friendlyDateTime(car.StartDateTime),
                        end: friendlyDateTime(car.StartDateTime, 1),
                        timezone: car.StartDateTime.timezone,
                        summary: "Pick Up: " + car.display_name,
                        description: "https://www.tripit.com" + car.relative_url + "\n" +
                            "\n" +
                            "Conf. # " + car.supplier_conf_num + "\n" +
                            "\n" +
                            car.supplier_name + "\n" +
                            "\n" +
                            "Pick Up: " + car.start_location_name + "\n" +
                            friendlyLocation(car.StartLocationAddress, car) + "\n" +
                            moment(friendlyDateTime(car.StartDateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(car.StartDateTime)).format("h:mma") + " " + moment().tz(car.StartDateTime.timezone).format("z") + "\n" +
                            "\n" +
                            "Drop Off: " + car.end_location_name + "\n" +
                            friendlyLocation(car.EndLocationAddress, car) + "\n" +
                            moment(friendlyDateTime(car.EndDateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(car.EndDateTime)).format("h:mma") + " " + moment().tz(car.EndDateTime.timezone).format("z") + "\n",
                        location: friendlyLocation(car.StartLocationAddress, car),
                        geo: friendlyGeo(car.StartLocationAddress, car)
                    });

                    calendar.createEvent({
                        uid: car.id + "DropOff",
                        start: friendlyDateTime(car.EndDateTime),
                        end: friendlyDateTime(car.EndDateTime, 1),
                        timezone: car.EndDateTime.timezone,
                        summary: "Drop Off: " + car.display_name,
                        description: "https://www.tripit.com" + car.relative_url + "\n" +
                            "\n" +
                            "Conf. # " + car.supplier_conf_num + "\n" +
                            "\n" +
                            car.supplier_name + "\n" +
                            "\n" +
                            "Drop Off: " + car.end_location_name + "\n" +
                            friendlyLocation(car.EndLocationAddress, car) + "\n" +
                            moment(friendlyDateTime(car.EndDateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(car.EndDateTime)).format("h:mma") + " " + moment().tz(car.EndDateTime.timezone).format("z") + "\n",
                        location: friendlyLocation(car.EndLocationAddress, car),
                        geo: friendlyGeo(car.EndLocationAddress, car)
                    });
                }
            }
        }

        // lodging
        if (data.LodgingObject) {
            var list = friendlyArray(data.LodgingObject);

            for (var j = 0; j < list.length; j++) {
                var lodging = list[j];

                if (lodging.trip_id == trip.id) {
                    calendar.createEvent({
                        uid: lodging.id + "CheckIn",
                        start: friendlyDateTime(lodging.StartDateTime),
                        end: friendlyDateTime(lodging.StartDateTime, 1),
                        timezone: lodging.StartDateTime.timezone,
                        summary: "Check In: " + lodging.display_name,
                        description: "https://www.tripit.com" + lodging.relative_url + "\n" +
                            "\n" +
                            "Conf. # " + lodging.supplier_conf_num + "\n" +
                            "\n" +
                            lodging.supplier_name + "\n" +
                            "\n" +
                            "Check In\n" +
                            moment(friendlyDateTime(lodging.StartDateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(lodging.StartDateTime)).format("h:mma") + " " + moment().tz(lodging.StartDateTime.timezone).format("z") + "\n" +
                            "\n" +
                            "Check Out\n" +
                            moment(friendlyDateTime(lodging.EndDateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(lodging.EndDateTime)).format("h:mma") + " " + moment().tz(lodging.EndDateTime.timezone).format("z") + "\n",
                        location: friendlyLocation(lodging.Address, lodging),
                        geo: friendlyGeo(lodging.Address, lodging)
                    });

                    calendar.createEvent({
                        uid: lodging.id + "CheckOut",
                        start: friendlyDateTime(lodging.EndDateTime),
                        end: friendlyDateTime(lodging.EndDateTime, 1),
                        timezone: lodging.EndDateTime.timezone,
                        summary: "Check Out: " + lodging.display_name,
                        description: "https://www.tripit.com" + lodging.relative_url + "\n" +
                            "\n" +
                            "Conf. # " + lodging.supplier_conf_num + "\n" +
                            "\n" +
                            lodging.supplier_name + "\n" +
                            "\n" +
                            "Check Out\n" +
                            moment(friendlyDateTime(lodging.EndDateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(lodging.EndDateTime)).format("h:mma") + " " + moment().tz(lodging.EndDateTime.timezone).format("z") + "\n",
                        location: friendlyLocation(lodging.Address, lodging),
                        geo: friendlyGeo(lodging.Address, lodging)
                    });
                }
            }
        }

        // dinner reservations
        if (data.RestaurantObject) {
            var list = friendlyArray(data.RestaurantObject);

            for (var j = 0; j < list.length; j++) {
                var reservation = list[j];

                if (reservation.trip_id == trip.id) {
                    calendar.createEvent({
                        uid: reservation.id,
                        start: friendlyDateTime(reservation.DateTime),
                        end: friendlyDateTime(reservation.DateTime, 1),
                        timezone: reservation.DateTime.timezone,
                        summary: reservation.display_name,
                        description: "https://www.tripit.com" + reservation.relative_url + "\n" +
                            "\n" +
                            "Conf. # " + reservation.supplier_conf_num + "\n" +
                            "\n" +
                            reservation.supplier_name + "\n" +
                            "\n" +
                            "Table for " + reservation.number_patrons + "\n" +
                            moment(friendlyDateTime(reservation.DateTime)).format("dddd, MMMM Do") + "\n" +
                            moment(friendlyDateTime(reservation.DateTime)).format("h:mma") + " " + moment().tz(reservation.DateTime.timezone).format("z") + "\n",
                        location: friendlyLocation(reservation.Address, reservation),
                        geo: friendlyGeo(reservation.Address, reservation)
                    });
                }
            }
        }
    }
}

function friendlyArray(data) {
    if (Array.isArray(data)) {
        return data;
    }
    else {
        return [
            data
        ];
    }
}

function friendlyDateTime(dateTime, offsetHours) {
    if (dateTime.time) {
        if (offsetHours) {
            return moment(dateTime.date + "T" + dateTime.time).add(offsetHours, "hours").toDate();
        }
        else {
            return moment(dateTime.date + "T" + dateTime.time).toDate();
        }
    }
    else {
        return moment(dateTime.date).toDate();
    }
}

function friendlyLocation(address, object) {
    if (address) {
        return address.address;
    }

    if (object.Address) {
        return object.Address.address;
    }

    if (object.location_name) {
        return object.location_name;
    }

    return null;
}

function friendlyGeo(address, object) {
    if (address) {
        return address.address;
    }

    if (object.Address) {
        return object.Address.latitude + ";" + object.Address.longitude
    }

    return null;
}
