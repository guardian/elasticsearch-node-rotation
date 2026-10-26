import { RotationPlan, validateRotationPlan } from '../src/utils/handlerInputs';

function plan(): RotationPlan {
    const sourceAsg = {
        name: 'source',
        arn: 'arn:source',
        desiredCapacity: 2,
        instanceIds: ['i-target', 'i-peer'],
    };
    return {
        version: 1,
        sourceAsg,
        destinationAsg: { ...sourceAsg, instanceIds: [...sourceAsg.instanceIds] },
        expectedClusterSize: 3,
    };
}

it('accepts a serialized same-ASG plan', () => {
    const saved = JSON.parse(JSON.stringify(plan()));
    expect(() => validateRotationPlan(saved, 'source', 'source', 'i-target')).not.toThrow();
});

it('accepts an empty destination in a cross-ASG plan', () => {
    const saved = plan();
    saved.destinationAsg = {
        name: 'destination',
        arn: 'arn:destination',
        desiredCapacity: 0,
        instanceIds: [],
    };
    expect(() => validateRotationPlan(saved, 'source', 'destination', 'i-target')).not.toThrow();
});

const invalidPlans: Array<[string, (saved: RotationPlan) => void]> = [
    [
        'unsupported version',
        (saved) => {
            Object.assign(saved, { version: 2 });
        },
    ],
    [
        'missing snapshot',
        (saved) => {
            Reflect.deleteProperty(saved, 'destinationAsg');
        },
    ],
    [
        'blank ARN',
        (saved) => {
            saved.sourceAsg.arn = '';
        },
    ],
    [
        'negative capacity',
        (saved) => {
            saved.sourceAsg.desiredCapacity = -1;
        },
    ],
    [
        'capacity/membership mismatch',
        (saved) => {
            saved.sourceAsg.desiredCapacity++;
        },
    ],
    [
        'duplicate IDs',
        (saved) => {
            saved.sourceAsg.instanceIds = ['i-target', 'i-target'];
        },
    ],
    [
        'missing target',
        (saved) => {
            saved.sourceAsg.instanceIds[0] = 'i-other';
        },
    ],
    [
        'wrong source name',
        (saved) => {
            saved.sourceAsg.name = 'wrong';
        },
    ],
    [
        'wrong destination name',
        (saved) => {
            saved.destinationAsg.name = 'wrong';
        },
    ],
    [
        'inconsistent same-ASG identity',
        (saved) => {
            saved.destinationAsg.arn = 'arn:other';
        },
    ],
    [
        'invalid cluster size',
        (saved) => {
            saved.expectedClusterSize = 0;
        },
    ],
];

it.each(invalidPlans)('rejects %s', (_name, invalidate) => {
    const saved = plan();
    invalidate(saved);
    expect(() => validateRotationPlan(saved, 'source', 'source', 'i-target')).toThrow(
        /rotation plan/i
    );
});

it('rejects a missing legacy plan', () => {
    expect(() => validateRotationPlan(undefined!, 'source', 'source', 'i-target')).toThrow(
        /rotation plan/i
    );
});

it.each(['same ARN', 'overlapping membership'])('rejects cross-ASG plans with %s', (conflict) => {
    const saved = plan();
    saved.destinationAsg =
        conflict === 'same ARN'
            ? { name: 'destination', arn: 'arn:source', desiredCapacity: 0, instanceIds: [] }
            : {
                  name: 'destination',
                  arn: 'arn:destination',
                  desiredCapacity: 1,
                  instanceIds: ['i-peer'],
              };
    expect(() => validateRotationPlan(saved, 'source', 'destination', 'i-target')).toThrow(
        /rotation plan/i
    );
});
