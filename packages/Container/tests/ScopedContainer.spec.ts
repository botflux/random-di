import {createContainerBuilder} from '../src/Implementation/Container'
import {LifeCycle} from '../src/Interfaces'
import {createScopedContainerBuilder} from '../src/Implementation/ScopedContainer'

describe('#ScopedContainer', function () {
    describe('#ScopedContainer.has', function () {
        it('should return true when a service is in inner or in parent container', function () {
            // Arrange
            const parentContainer = createContainerBuilder()
                .addFactory('hello', () => 'world', LifeCycle.Singleton)
                .build()

            const scopedContainer = createScopedContainerBuilder(parentContainer)
                .addFactory('foo', () => 'bar', LifeCycle.Singleton)
                .build()

            // Act
            const hasFoo = scopedContainer.has("foo")
            const hasHello = scopedContainer.has('hello')
            const hasBar = scopedContainer.has('bar')

            // Assert
            expect(hasFoo).toBe(true)
            expect(hasHello).toBe(true)
            expect(hasBar).toBe(false)
        })
    })

    describe('#ScopedContainer.hasAsync', function () {
        it('should return true when a service is in inner or in parent container', function () {
            // Arrange
            const parentContainer = createContainerBuilder()
                .addAsyncFactory('hello', () => Promise.resolve("world"), LifeCycle.Singleton)
                .build()

            const scopedContainer = createScopedContainerBuilder(parentContainer)
                .addAsyncFactory('foo',  () => Promise.resolve("bar"), LifeCycle.Singleton)
                .build()

            // Act
            const hasFoo = scopedContainer.hasAsync('foo')
            const hasHello = scopedContainer.hasAsync('hello')
            const hasBar = scopedContainer.hasAsync('bar')

            // Assert
            expect(hasFoo).toBe(true)
            expect(hasHello).toBe(true)
            expect(hasBar).toBe(false)
        })
    })

    describe('#ScopedContainer.get', function () {
        it('should construct a scoped service from parent container', function () {
            // Arrange
            const parentContainer = createContainerBuilder()
                .addFactory('hello', () => "world", LifeCycle.Singleton)
                .build()

            const scopedContainer = createScopedContainerBuilder(parentContainer)
                .addFactory('foo',  provider => provider.get("hello") + " bar", LifeCycle.Singleton)
                .build()

            // Act
            const foo = scopedContainer.get("foo")
            const hello = scopedContainer.get('hello')

            // Assert
            expect(foo).toBe("world bar")
            expect(hello).toBe("world")
        })
    })

    describe('#ScopedContainer.getAsync', function () {
        it('should construct a an async scoped service from parent container', async function () {
            // Arrange
            const parentContainer = createContainerBuilder()
                .addAsyncFactory('hello', () => Promise.resolve("world"), LifeCycle.Singleton)
                .build()

            const scopedContainer = createScopedContainerBuilder(parentContainer)
                .addAsyncFactory('foo',  async provider => await provider.getAsync("hello") + " bar", LifeCycle.Singleton)
                .build()

            // Act
            const foo = await scopedContainer.getAsync("foo")
            const hello = await scopedContainer.getAsync('hello')

            // Assert
            expect(foo).toBe("world bar")
            expect(hello).toBe("world")
        })
    })
})
