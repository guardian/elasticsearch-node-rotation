export async function handler(event: ClusterStatusResponse) {
    return new Promise((resolve, reject) => {
        resolve("done");
    })

}