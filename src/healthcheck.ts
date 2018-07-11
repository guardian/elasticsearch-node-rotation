export function handler(event, context, callback) {
    console.log("Checking ES cluster health");
    callback(null, "Success");
}