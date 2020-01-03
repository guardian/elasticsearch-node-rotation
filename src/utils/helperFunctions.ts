export function delay<T>(value: T): Promise<T> {
    return new Promise<T>((resolve) => {
       setTimeout(() => resolve(value), 15000)
    });
}

export function retry<T>(fn:()=> Promise<T>, taskName: string, remainingRetries: number): Promise<T> {
    console.log(`Number of retries remaining ${remainingRetries} when ${taskName}`)
    return fn()
    .then((res) => {
        console.log(`Succeeded when ${taskName}`)
        return res
    })
    .catch((err) =>{
        console.error(`Failed when ${taskName} with :\n${err}`)
        if (remainingRetries>0) {
            return delay({}).then(() => retry(fn, taskName, remainingRetries-1))
        } else {
            console.error(`Ran out of retries when ${taskName}`)
            return Promise.reject(err)
        }
    })
}