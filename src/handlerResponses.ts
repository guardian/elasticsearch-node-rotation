interface DefaultResponse {
    instanceId: string;
}

interface ClusterStatusResponse extends DefaultResponse {
    clusterStatus: string;
}

interface AddElasticsearchNodeResponse extends DefaultResponse {
    expectedClusterSize: number;
}