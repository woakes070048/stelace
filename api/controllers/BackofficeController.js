/* global
    Booking, CancellationService, Item, GamificationService, MonitoringService, TokenService,
    TransactionService, User
*/

/**
 * BackofficeController
 *
 * @description :: Server-side logic for managing backoffices
 * @help        :: See http://sailsjs.org/#!/documentation/concepts/Controllers
 */

module.exports = {

    findOne: findOne,
    find: find,
    create: create,
    update: update,
    destroy: destroy,

    getIncompleteBookings: getIncompleteBookings,
    setAction: setAction,
    getBooking: getBooking,
    cancelBooking: cancelBooking,

};

function find(req, res) {
    return res.forbidden();
}

function findOne(req, res) {
    return res.forbidden();
}

function create(req, res) {
    return res.forbidden();
}

function update(req, res) {
    return res.forbidden();
}

function destroy(req, res) {
    return res.forbidden();
}

function getIncompleteBookings(req, res) {
    var itemMode = req.param("itemMode");
    var access = "self";

    if (! TokenService.isRole(req, "admin")) {
        return res.forbidden();
    }

    return Promise.coroutine(function* () {
        var result = yield MonitoringService.getIncompleteBookings({
            access: access,
            itemMode: itemMode
        });
        res.json(result);
    })()
    .catch(res.sendError);
}

function setAction(req, res) {
    var actionId = req.param("actionId");
    var usersIds = req.param("usersIds");

    if (! TokenService.isRole(req, "admin")) {
        return res.forbidden();
    }

    if (! actionId
     || ! µ.checkArray(usersIds, "id")
    ) {
        return res.badRequest();
    }

    usersIds = _(usersIds)
        .map(userId => parseInt(userId, 10))
        .uniq()
        .value();

    return Promise
        .resolve()
        .then(() => {
            var actions = GamificationService.getActions();
            if (! actions[actionId]) {
                throw new BadRequestError("Gamification action doesn't exist.");
            }

            return User.find({ id: usersIds });
        })
        .then(users => {
            var indexedUsers = _.indexBy(users, "id");
            var notFoundUsersId = _.reduce(usersIds, (memo, userId) => {
                if (! indexedUsers[userId]) {
                    memo.push(userId);
                }
                return memo;
            }, []);

            if (notFoundUsersId.length) {
                throw new NotFoundError("Not found users: " + JSON.stringify(notFoundUsersId));
            }

            return [
                users,
                GamificationService.getUsersStats(users)
            ];
        })
        .spread((users, usersStats) => {
            return Promise
                .resolve(users)
                .map(user => {
                    var actionsIds = [actionId];
                    var userStats  = usersStats[user.id];

                    return GamificationService.setActions(user, actionsIds, null, req.logger, userStats, req);
                });
        })
        .then(() => res.ok())
        .catch(res.sendError);
}

function getBooking(req, res) {
    var id = req.param("id");
    var access = "self";
    var userAccess = "others";

    if (! TokenService.isRole(req, "admin")) {
        return res.forbidden();
    }

    return Promise.coroutine(function* () {
        var booking = yield Booking.findOne({ id: id });
        if (! booking) {
            throw new NotFoundError();
        }

        var usersIds = [booking.ownerId, booking.bookerId];

        var result = yield Promise.props({
            users: User.find({ id: usersIds }),
            item: Item.findOne({ id: booking.itemId }),
            hashAssessments: Booking.getAssessments([booking])
        });

        var users              = result.users;
        var item               = result.item;
        var bookingAssessments = result.hashAssessments[booking.id];

        var indexedUsers = _.indexBy(users, "id");

        booking                  = Booking.expose(booking, access);
        booking.item             = Item.expose(item, access);
        booking.owner            = User.expose(indexedUsers[booking.ownerId], userAccess);
        booking.booker           = User.expose(indexedUsers[booking.bookerId], userAccess);
        booking.inputAssessment  = bookingAssessments.inputAssessment;
        booking.outputAssessment = bookingAssessments.outputAssessment;

        res.json(booking);
    })()
    .catch(res.sendError);
}

function cancelBooking(req, res) {
    var id = req.param("id");
    var reasonType = req.param("reasonType");
    var reason     = req.param("reason");
    var trigger    = req.param("trigger");
    var cancel     = req.param("cancel");

    var access = "self";

    return Promise.coroutine(function* () {
        var booking = yield Booking.findOne({ id: id });
        if (! booking) {
            throw new NotFoundError();
        }

        var transactionManagers = yield TransactionService.getBookingTransactionsManagers([booking.id]);
        var transactionManager  = transactionManagers[booking.id];

        booking = yield CancellationService.cancelBooking(booking, transactionManager, {
            reasonType: reasonType,
            reason: reason,
            trigger: trigger,
            cancelPayment: true,
            cancel: cancel
        });

        res.json(Booking.expose(booking, access));
    })()
    .catch(res.sendError);
}
