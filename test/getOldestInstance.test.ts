import { _ } from '../src/getOldestInstance'

const { findOldestInstance, Instance } = _;

function createDate(date: Date, days: number): Date {
    let result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

describe("findOldestInstance", () => {
    it("should identify the oldest instance correctly", () => {
        const referenceDate: Date = new Date(2018, 7, 21);
        const oldestInstance = new Instance("id123", referenceDate);
        const newerInstance = new Instance("id124", createDate(referenceDate, 7));
        const newestInstance = new Instance("id125", createDate(referenceDate, 21));
        const instances: Instance[] = [newerInstance, oldestInstance, newestInstance];
        expect(findOldestInstance(instances)).toEqual(oldestInstance)
    });
});