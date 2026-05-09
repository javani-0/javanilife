In order to inform the delhivery for the order to be picked up from the warehouse, pickup request creation API facilitates creation of a pickup request in delhivery system to further collect the shipments.

It takes the four inputs, i.e., pickup time, date, warehouse name, and the quantity and return pickup\_id in a successful response.

Multiple pick-up requests can be made in one day but only after one pick-up request has been completed. Once the shipments have been picked up by delhivery then you can schedule another pick-up request. This is applicable when the pick-ups are made for a single warehouse. If there are multiple warehouses you can schedule multiple pick-up requests at the same time for two different warehouses.

This API is also optional as pick-up request can be created through CL panel as well

### Test Environment URL

**https://staging-express.delhivery.com/​fm/request/new/**

### Production Environment URL

**https://track.delhivery.com/​fm/request/new/**

Updatedabout 6 years ago

* * *

Updatedabout 6 years ago

* * *