import {createContainerBuilder, LifeCycle, provideAsync, provideSync, ServiceNotFoundError} from '../../src/v0'


describe('facilitate factory creation by using a factory extension', function () {
    it('should return a function that abstract calls to get and getAsync', async function () {
        // Arrange
        const builder = createContainerBuilder()
            .addAsyncFactory('hello', async () => 'world', LifeCycle.Singleton)

        // Act
        const container = builder.addAsyncFactory(
            'foo',
            provideAsync(async (hello: string) => `foo${hello}`, [ 'hello' ]),
            LifeCycle.Singleton
        ).build()

        // Assert
        expect(await container.getAsync('foo')).toBe('fooworld')
    })

    it('should reject with a service not found error when trying to get an un-existing service', async function () {
        // Arrange
        const builder = createContainerBuilder()

        // Act
        const container = builder.addAsyncFactory(
            'foo',
            provideAsync(async (hello: string) => hello + 'world', [ 'hello' ]),
            LifeCycle.Singleton
        ).build()

        // Assert
        await expect(container.getAsync('foo')).rejects.toEqual(new ServiceNotFoundError('hello'))
    })

    it('should also work when sync dependencies', function () {
        // Arrange
        const builder = createContainerBuilder()
            .addFactory('foo', () => 'foo', LifeCycle.Singleton)

        // Act
        const container = builder
            .addFactory(
                'bar',
                provideSync((foo: string) => foo + 'bar', [ 'foo' ]),
                LifeCycle.Singleton
            ).build()

        // Assert
        expect(container.get('bar')).toEqual('foobar')
    })
})
