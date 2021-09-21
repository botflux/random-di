import {NullFulfilledCallbackError, SyncPromise} from '../src/SyncPromise'

describe('sync promise', function () {
    it('should use the same api as promise for chaining operation', function () {
        // Arrange
        const value = 14
        const syncPromise = SyncPromise.from(value)

        // Act
        const doubledValue = ((syncPromise
            .then(value => value * 2)) as unknown as SyncPromise<number>)
            .unwrap()

        // Assert
        expect(doubledValue).toBe(28)
    })

    it('should throw if no onfulfilled callback was passed', function () {
        // Arrange
        // Act
        const throws = () => SyncPromise.from(1).then()

        // Assert
        expect(throws).toThrow(NullFulfilledCallbackError)
    })

    it('should wrap promise like in a Promise if one element is a Promise', function () {
        // Arrange
        const promiseLike: PromiseLike<any>[] = [
            SyncPromise.from(1),
            SyncPromise.from('hello world'),
            Promise.resolve(true)
        ]

        // Act
        const allPromises = SyncPromise.allWithoutTypeChecking(promiseLike)

        // Assert
        expect(allPromises).toBeInstanceOf(Promise)
        expect(allPromises).not.toBeInstanceOf(SyncPromise)
    })

    it('should wrap promise like in a SyncPromise if all element are sync values', function () {
        // Arrange
        const promiseLike: any[] = [
            SyncPromise.from(2),
            SyncPromise.from("hello world"),
            "foo"
        ]

        // Act
        // @ts-ignore We should do a isSyncPromise check before
        const allPromises: SyncPromise<any> = SyncPromise.allWithoutTypeChecking(promiseLike)

        // Assert
        expect(allPromises.unwrap()).toEqual([ 2, "hello world", "foo" ])
    })
})
