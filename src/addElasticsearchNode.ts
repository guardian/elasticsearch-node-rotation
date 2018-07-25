export async function handler(event: ClusterStatusResponse): Promise<AddElasticsearchNodeResponse> {
    return new Promise<AddElasticsearchNodeResponse>((resolve, reject) => {
        const placeholderResponse: AddElasticsearchNodeResponse = { "instanceId": "id123", "expectedClusterSize": 6 };
        resolve(placeholderResponse);
    })
}