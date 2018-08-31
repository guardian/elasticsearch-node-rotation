import {_} from '../src/migrateShards';
import {ElasticsearchNode, Move, RoutingTable} from '../src/elasticsearch/types';
import {Instance} from '../src/aws/types';

const { moveInstructions } = _;

describe("moveInstructions", () => {
    it("should get a list of all the shard migrations that we want ES to perform", () => {
        const expectedResponse: Move[] = [
            new Move(".monitoring-kibana-6-2018.08.01", 0, "qR4vaE3zRvyjXBHvONxh_w", "1O3sqqH4R8ScTrtV9tX6fg"),
            new Move(".triggered_watches", 1, "qR4vaE3zRvyjXBHvONxh_w", "1O3sqqH4R8ScTrtV9tX6fg"),
            new Move(".watches", 2, "qR4vaE3zRvyjXBHvONxh_w", "1O3sqqH4R8ScTrtV9tX6fg"),
            new Move(".monitoring-es-6-2018.08.01", 0, "qR4vaE3zRvyjXBHvONxh_w", "1O3sqqH4R8ScTrtV9tX6fg"),
            new Move(".watcher-history-6-2018.08.01", 0, "qR4vaE3zRvyjXBHvONxh_w", "1O3sqqH4R8ScTrtV9tX6fg"),
            new Move(".monitoring-alerts-6", 1, "qR4vaE3zRvyjXBHvONxh_w", "1O3sqqH4R8ScTrtV9tX6fg")
        ];
        const oldestNode = new ElasticsearchNode(new Instance("id123", new Date(), "ip1"), "qR4vaE3zRvyjXBHvONxh_w");
        const newestNode = new ElasticsearchNode(new Instance("id124", new Date(), "ip2"), "1O3sqqH4R8ScTrtV9tX6fg");
        const routingTable = new RoutingTable(sampleRoutingTable);
        expect(moveInstructions(routingTable, oldestNode, newestNode)).toEqual(expectedResponse);
    })
});



const sampleRoutingTable: object = {
    "cluster_name": "logger",
    "routing_table": {
        "indices": {
            ".monitoring-kibana-6-2018.08.01": {
                "shards": {
                    "0": [
                        {
                            "state": "STARTED",
                            "primary": false,
                            "node": "qR4vaE3zRvyjXBHvONxh_w",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".monitoring-kibana-6-2018.08.01",
                            "allocation_id": {
                                "id": "Wsf4J0l2Q4-Mv_8JDx0OYQ"
                            }
                        },
                        {
                            "state": "STARTED",
                            "primary": true,
                            "node": "1O3sqqH4R8ScTrtV9tX6fg",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".monitoring-kibana-6-2018.08.01",
                            "allocation_id": {
                                "id": "Q5bikEGATwika9XTPI-SeA"
                            }
                        }
                    ]
                }
            },
            ".triggered_watches": {
                "shards": {
                    "0": [
                        {
                            "state": "STARTED",
                            "primary": true,
                            "node": "9cPvBWhMRveTnBXEdJFe2Q",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".triggered_watches",
                            "allocation_id": {
                                "id": "k9q1mvNmRGC-Iki4ErdG2w"
                            }
                        },
                        {
                            "state": "STARTED",
                            "primary": false,
                            "node": "qR4vaE3zRvyjXBHvONxh_w",
                            "relocating_node": null,
                            "shard": 1,
                            "index": ".triggered_watches",
                            "allocation_id": {
                                "id": "AN8bppAFQDuBNY_0HBaGRA"
                            }
                        }
                    ]
                }
            },
            ".watches": {
                "shards": {
                    "0": [
                        {
                            "state": "STARTED",
                            "primary": true,
                            "node": "9cPvBWhMRveTnBXEdJFe2Q",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".watches",
                            "allocation_id": {
                                "id": "NphkCcCrQW2lhRGvexS-jQ"
                            }
                        },
                        {
                            "state": "STARTED",
                            "primary": false,
                            "node": "qR4vaE3zRvyjXBHvONxh_w",
                            "relocating_node": null,
                            "shard": 2,
                            "index": ".watches",
                            "allocation_id": {
                                "id": "1TytGG9HTTCtUOysAQ8leg"
                            }
                        }
                    ]
                }
            },
            ".monitoring-es-6-2018.08.01": {
                "shards": {
                    "0": [
                        {
                            "state": "STARTED",
                            "primary": true,
                            "node": "9cPvBWhMRveTnBXEdJFe2Q",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".monitoring-es-6-2018.08.01",
                            "allocation_id": {
                                "id": "R7ay9wGpSxiZ6aqizWJdOw"
                            }
                        },
                        {
                            "state": "STARTED",
                            "primary": false,
                            "node": "qR4vaE3zRvyjXBHvONxh_w",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".monitoring-es-6-2018.08.01",
                            "allocation_id": {
                                "id": "TltWlzfFRTmNx7kL3FnJew"
                            }
                        }
                    ]
                }
            },
            ".kibana": {
                "shards": {
                    "0": [
                        {
                            "state": "STARTED",
                            "primary": false,
                            "node": "9cPvBWhMRveTnBXEdJFe2Q",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".kibana",
                            "allocation_id": {
                                "id": "vQUCz1jmQv6YxO1qT5anmg"
                            }
                        },
                        {
                            "state": "STARTED",
                            "primary": true,
                            "node": "1O3sqqH4R8ScTrtV9tX6fg",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".kibana",
                            "allocation_id": {
                                "id": "6NOF9_UETsCjlphfC0o-Ug"
                            }
                        }
                    ]
                }
            },
            ".watcher-history-6-2018.08.01": {
                "shards": {
                    "0": [
                        {
                            "state": "STARTED",
                            "primary": true,
                            "node": "9cPvBWhMRveTnBXEdJFe2Q",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".watcher-history-6-2018.08.01",
                            "allocation_id": {
                                "id": "gyHOFecyR26DAEJr1Lc6MA"
                            }
                        },
                        {
                            "state": "STARTED",
                            "primary": false,
                            "node": "qR4vaE3zRvyjXBHvONxh_w",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".watcher-history-6-2018.08.01",
                            "allocation_id": {
                                "id": "HWUf0DkBQWisF68_sFz-FQ"
                            }
                        }
                    ]
                }
            },
            ".monitoring-alerts-6": {
                "shards": {
                    "0": [
                        {
                            "state": "STARTED",
                            "primary": true,
                            "node": "9cPvBWhMRveTnBXEdJFe2Q",
                            "relocating_node": null,
                            "shard": 0,
                            "index": ".monitoring-alerts-6",
                            "allocation_id": {
                                "id": "xkKfVIV0RmOtzFY64sngQg"
                            }
                        },
                        {
                            "state": "STARTED",
                            "primary": false,
                            "node": "qR4vaE3zRvyjXBHvONxh_w",
                            "relocating_node": null,
                            "shard": 1,
                            "index": ".monitoring-alerts-6",
                            "allocation_id": {
                                "id": "lTKUAUbnTauv5Qc7wtXtgw"
                            }
                        }
                    ]
                }
            }
        }
    }
};