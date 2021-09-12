import {DbConnection, UserRepository} from '../Services'
import {TransientService} from '../../src/LifeCycle/TransientService'

describe('transient service lifecycle', function () {
    it('should instantiate the transient service every time', function () {
        // Arrange
        const factory = (dbConnection: DbConnection) => new UserRepository(dbConnection)
        const service = new TransientService({ factory })

        // Act
        const instance1 = service.instantiate(new DbConnection())
        const instance2 = service.instantiate(new DbConnection())

        // Assert
        expect(instance1).not.toBe(instance2)
        expect(instance1).toBeInstanceOf(UserRepository)
        expect(instance2).toBeInstanceOf(UserRepository)
    })
})
