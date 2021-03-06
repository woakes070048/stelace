/* global GamificationService, Location, User, Item, IPService, MapService */

/**
 * LocationController
 *
 * @description :: Server-side logic for managing locations
 * @help        :: See http://links.sailsjs.org/docs/controllers
 */

module.exports = {

    find: find,
    findOne: findOne,
    create: create,
    update: update,
    destroy: destroy,

    my: my,
    updateMain: updateMain,
    getJourneysDuration: getJourneysDuration,
    getGeoInfo: getGeoInfo

};

function find(req, res) {
    return res.forbidden();
}

function findOne(req, res) {
    return res.forbidden();
}

function create(req, res) {
    var access = "self";
    var filteredAttrs = [
        "name",
        "alias",
        "streetNum",
        "street",
        "postalCode",
        "city",
        "department",
        "region",
        "latitude",
        "longitude",
        "establishment",
        "provider",
        "remoteId"
    ];
    var createAttrs = _.pick(req.allParams(), filteredAttrs);
    createAttrs.userId = req.user.id;
    createAttrs.transportMode = "car";

    // TODO: transportMode will not be only "car" in the future
    if (! createAttrs.name
     || ! createAttrs.city
     || ! createAttrs.latitude
     || ! createAttrs.longitude
     || ! createAttrs.provider || ! _.contains(Location.get("providers"), createAttrs.provider)
     || ! createAttrs.remoteId
    ) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Location.find({ userId: req.user.id });
        })
        .then(locations => {
            if (locations.length >= User.get("maxNbLocations")) {
                throw new BadRequestError("max locations reached");
            }

            var identicalLocation = _.find(locations, {
                remoteId: createAttrs.remoteId
            });
            if (identicalLocation) {
                throw new BadRequestError("identical location");
            }

            // if no location, assign the first to be the main
            if (! locations.length) {
                createAttrs.main = true;
            }

            return Location.create(createAttrs);
        })
        .then(location => {
            GamificationService.checkActions(req.user, ["FIRST_LOCATIONS_NB_2"], null, req.logger, req);

            User
                .syncOdooUser(req.user, {
                    updateLocation: true,
                    doNotCreateIfNone: true
                })
                .catch(err => {
                    req.logger.warn({ err: err }, "Odoo sync user fail");
                });

            res.json(Location.expose(location, access));
        })
        .catch(res.sendError);
}

function update(req, res) {
    var id = req.param("id");
    var access = "self";
    var filteredAttrs = [
        "name",
        "alias",
        "streetNum",
        "street",
        "postalCode",
        "city",
        "department",
        "region",
        "latitude",
        "longitude",
        "establishment",
        "provider",
        "remoteId"
    ];
    var updateAttrs = _.pick(req.allParams(), filteredAttrs);

    if (! updateAttrs.name
     || ! updateAttrs.city
     || ! updateAttrs.latitude
     || ! updateAttrs.longitude
     || ! updateAttrs.provider || ! _.contains(Location.get("providers"), updateAttrs.provider)
     || ! updateAttrs.remoteId
    ) {
        return res.badRequest();
    }

    return Promise
        .resolve()
        .then(() => {
            return Location.updateOne(
                {
                    id: id,
                    userId: req.user.id
                },
                updateAttrs
            );
        })
        .then(location => {
            res.json(Location.expose(location, access));
        })
        .catch(res.sendError);
}

function updateMain(req, res) {
    var id = req.param("id");

    return Promise
        .resolve()
        .then(() => {
            return Location.findOne({ id: id });
        })
        .then(location => {
            if (! location) {
                throw new NotFoundError();
            }
            if (location.userId !== req.user.id) {
                throw new ForbiddenError();
            }

            User
                .syncOdooUser(req.user, {
                    updateLocation: true,
                    doNotCreateIfNone: true
                })
                .catch(err => {
                    req.logger.warn({ err: err }, "Odoo sync user fail");
                });

            if (! location.main) {
                return setMain(location, req.user.id);
            } else {
                return;
            }
        })
        .then(() => res.json({ id: id }))
        .catch(res.sendError);



    function setMain(location, userId) {
        return Promise
            .resolve()
            .then(() => {
                return Location
                    .update(
                        {
                            userId: userId,
                            main: true
                        },
                        { main: false }
                    );
            })
            .then(() => {
                return Location.updateOne(location.id, { main: true });
            });
    }
}

function destroy(req, res) {
    var id = parseInt(req.param("id"), 10);

    return Promise
        .resolve()
        .then(() => {
            return [
                Location.findOne({ id: id })
            ];
        })
        .spread((location) => {
            if (! location) {
                throw new NotFoundError();
            }
            if (location.userId !== req.user.id) {
                throw new ForbiddenError();
            }
            if (location.main) {
                throw new BadRequestError("cannot destroy a main location");
            }

            return [
                location,
                Item.find({ ownerId: req.user.id })
            ];
        })
        .spread((location, items) => {
            if (items.length) {
                return removeLocationFromItems(id, items);
            } else {
                return;
            }
        })
        .then(() => {
            return Location.destroy({ id: id });
        })
        .then(() => res.json({ id: id }))
        .catch(res.sendError);



    function removeLocationFromItems(id, items) {
        return Promise
            .resolve(items)
            .each(item => {
                if (! item.locations || ! item.locations.length) {
                    return;
                }

                return Item.updateOne(item.id, { locations: _.without(item.locations, id) });
            });
    }
}

function my(req, res) {
    var access = "self";

    return Promise
        .resolve()
        .then(() => {
            return [
                Location.find({ userId: req.user.id })
            ];
        })
        .spread((locations) => {
            // set the main location as the first one
            var partition = _.partition(locations, function (location) {
                return location.main;
            });
            locations = partition[0].concat(partition[1]);

            res.json(Location.exposeAll(locations, access));
        })
        .catch(res.sendError);
}

function getJourneysDuration(req, res) {
    var from = req.param("from");
    var to   = req.param("to");

    try {
        from = JSON.parse(from);
        to   = JSON.parse(to);
    } catch (e) {
        return res.badRequest();
    }

    if (! MapService.isValidGpsPts(from) || ! MapService.isValidGpsPts(to)) {
        return res.badRequest();
    }

    return MapService
        .getOsrmJourneys(from, to)
        .then(journeys => res.json(journeys))
        .catch(res.sendError);
}

function getGeoInfo(req, res) {
    var ip = req.ip;

    // the request to get ip info can be long
    // constraint the server response to 3s
    return Promise
        .race([
            Promise.resolve({ ip: ip }).delay(3000),
            IPService.getInfo(ip)
        ])
        .then(function (geoInfo) {
            res.json(geoInfo);
        })
        .catch(res.sendError);
}

