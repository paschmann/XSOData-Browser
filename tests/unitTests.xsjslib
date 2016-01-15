/*global jasmine, describe, beforeOnce, it, expect*/
describe("My Test Suite", function() {

    var sysapi = '/lilabs/template/lib/api.xsjs';

    function callAPI(queryString) {
        var contentTypeHeader = {
            "Content-Type": "application/json"
        };
        var response = jasmine.callHTTPService(sysapi + queryString, $.net.http.GET, "", contentTypeHeader);
        return response.body ? response.body.asString() : "";
    }

    it("API should be available", function() {
        var response = jasmine.callHTTPService(sysapi);
        expect(response.status).toBe($.net.http.OK);
    });

    it("API: Test read function, expects system1, system2, path", function() {
        var requestQuery = '?service=read';
        var response = callAPI(requestQuery);
        expect(response).not.toMatch(/error/);
    });

});