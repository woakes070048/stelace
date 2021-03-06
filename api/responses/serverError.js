/* global LoggerService, ErrorService */

/**
 * 500 (Server Error) Response
 *
 * Usage:
 * return res.serverError();
 * return res.serverError(err);
 * return res.serverError(err, 'some/specific/error/view');
 *
 * NOTE:
 * If something throws in a policy or controller, or an internal
 * error is encountered, Sails will call `res.serverError()`
 * automatically.
 */

module.exports = function serverError(data, options) {

    var defaultData = { message: "server error" };

    // Get access to `req`, `res`, & `sails`
    var req = this.req;
    var res = this.res;
    var sails = req._sails;

    if (data) {
        var logger = req.logger || LoggerService.getLogger("app", { req: req });
        logger = logger.child({ errorStatus: 500 });
        logger.error({ err: data });
    }

    // Set status code
    res.status(500);

    // Log error to console
    if (typeof data !== "undefined") {
        sails.log.error('Sending 500 ("Server Error") response: \n', data);
    }
    else { // eslint-disable-line
        sails.log.error('Sending empty 500 ("Server Error") response');
    }

    // Only include errors in response if application environment
    // is not set to 'production'.  In production, we shouldn't
    // send back any identifying information about errors.
    var isProd = (sails.config.environment === "production");

    if (data instanceof Error) {
        if (! isProd || (isProd && data.expose === true)) {
            data = ErrorService.convertErrorToObj(data, isProd);
        } else {
            data = defaultData;
        }
    } else {
        if (isProd && (! options || options.forceData !== true)) {
            data = defaultData;
        }
    }

    // If the user-agent wants JSON, always respond with JSON
    if (req.wantsJSON) {
        return res.jsonx(data);
    }

    // If second argument is a string, we take that to mean it refers to a view.
    // If it was omitted, use an empty object (`{}`)
    options = (typeof options === 'string') ? { view: options } : options || {};

    // If a view was provided in options, serve it.
    // Otherwise try to guess an appropriate view, or if that doesn't
    // work, just send JSON.
    if (options.view) {
        return res.view(options.view, { data: data });
    }

    // If no second argument provided, try to serve the default view,
    // but fall back to sending JSON(P) if any errors occur.
    else { // eslint-disable-line
        return res.view('500', { data: data }, function (err, html) {

            // If a view error occured, fall back to JSON(P).
            if (err) {
                //
                // Additionally:
                // • If the view was missing, ignore the error but provide a verbose log.
                if (err.code === 'E_VIEW_FAILED') {
                    sails.log.verbose('res.serverError() :: Could not locate view for error page (sending JSON instead).  Details: ', err);
                }
                // Otherwise, if this was a more serious error, log to the console with the details.
                else { // eslint-disable-line
                    sails.log.warn('res.serverError() :: When attempting to render error page view, an error occured (sending JSON instead).  Details: ', err);
                }
                return res.jsonx(data);
            }

            return res.send(html);
        });
    }

};

