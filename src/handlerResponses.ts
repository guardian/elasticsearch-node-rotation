interface ClusterStatusResponse {
    instanceId: string;
    clusterStatus: string;
}

interface AddElasticsearchNodeResponse {
    instanceId: string;
    expectedClusterSize: number;
}