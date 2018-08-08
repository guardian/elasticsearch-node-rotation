import {Instance} from '../src/aws/types'
import {findOldestInstance} from '../src/getOldestNode'

function createDate(date: Date, days: number): Date {
    let result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

describe("findOldestInstance", () => {
    it("should identify the oldest instance correctly", () => {
        const referenceDate: Date = new Date(2018, 7, 21);
        const oldestInstance = new Instance("id123", referenceDate, "ip1");
        const newerInstance = new Instance("id124", createDate(referenceDate, 7), "ip2");
        const newestInstance = new Instance("id125", createDate(referenceDate, 21), "ip3");
        const instances: Instance[] = [newerInstance, oldestInstance, newestInstance];
        expect(findOldestInstance(instances)).toEqual(oldestInstance)
    });
});