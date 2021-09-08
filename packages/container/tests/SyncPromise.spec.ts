import {SyncPromise} from '../src/SyncPromise'

describe('sync promise', function () {
    it('should use the same api as promise for chaining operation', function () {
        // Arrange
        const value = 14
        const syncPromise = SyncPromise.from(value)

        // Act
        const doubledValue = syncPromise
            .then(value => value * 2)
            .unwrap()

        // Assert
        expect(doubledValue).toBe(28)
    })
})
