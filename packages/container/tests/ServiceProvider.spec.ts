import {createContainerBuilder} from '../src/Implementation/Container'
import {LifeCycle} from '../src/Interfaces'
import {createAsyncServiceProvider} from '../src/Implementation/ServiceProvider'

describe('#AsyncServiceProvider', function () {
    it('should proxy inner container getAsync method', async function () {
        // Arrange
        const container = createContainerBuilder()
            .addAsyncFactory('foo', () => Promise.resolve("foo"), LifeCycle.Singleton)
            .build()

        const provider = createAsyncServiceProvider(container)

        // Act
        const foo = await provider.getAsync("foo")

        // Assert
        expect(foo).toBe("foo")
    })

    it('should proxy inner container has method', function () {
        // Arrange
        const container = createContainerBuilder()
            .addAsyncFactory("hello", () => Promise.resolve("world"), LifeCycle.Transient)
            .addFactory("service", () => "service", LifeCycle.Transient)
            .build()

        const provider = createAsyncServiceProvider(container)

        // Act
        const hasHello = provider.hasAsync("hello")
        const hasService = provider.has("service")
        const hasFoo = provider.hasAsync("foo")
        const hasBar = provider.has("bar")

        // Assert
        expect(hasHello).toBe(true)
        expect(hasService).toBe(true)
        expect(hasFoo).toBe(false)
        expect(hasBar).toBe(false)
    })
})

describe('#SyncServiceProvider', function () {
    it('should proxy inner container has method', function () {
        // Arrange
        const container = createContainerBuilder()
            .addFactory("service", () => "service", LifeCycle.Transient)
            .build()

        const provider = createAsyncServiceProvider(container)

        // Act
        const hasService = provider.has("service")
        const hasBar = provider.has("bar")

        // Assert
        expect(hasService).toBe(true)
        expect(hasBar).toBe(false)
    })
})
