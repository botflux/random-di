import {EmptyOptionError, None, Option, Some} from '../../src/Monads/Option'

describe('the option type wrap a null or undefined value', function () {
    describe('ok result wrap a non-null value', function () {
        it('should encapsulate a non-nullable value', function () {
            // Arrange
            const value = 2

            // Act
            const optionalValue = Some(value)

            // Assert
            expect(optionalValue.unwrap()).toBe(2)
            expect(optionalValue.isSome).toBe(true)
            expect(optionalValue.isNone).toBe(false)
        })

        it('should map value of a non-null option', function () {
            // Arrange
            const value = 'hello'

            // Act
            const optionalValue = Some(value)
                .map(value => value.toUpperCase())

            // Assert
            expect(optionalValue.unwrap()).toBe('HELLO')
        })

        it('should unwrap non-null value to a ok result', function () {
            // Arrange
            const option = Some('hello world')

            // Act
            const result = option.toResult()

            // Assert
            expect(result.isOk).toBe(true)
            expect(result.isError).toBe(false)
            expect(result.unwrap()).toBe('hello world')
        })

        it('should not fallback on a default value if the option is not empty', function () {
            // Arrange
            const option = Some(false)

            // Act
            const value = option.unwrapOr(true)

            // Assert
            expect(value).toBe(false)
        })
    })

    describe('empty result wrap a nullable value', function () {
        it('should not map empty option', function () {
            // Arrange
            const option: Option<string> = None

            // Act
            const newOption = option.map(value => value.toUpperCase())

            // Assert
            expect(newOption.isNone).toBe(true)
            expect(newOption.isSome).toBe(false)
        })

        it('should throw when unwrapping an empty option', function () {
            // Arrange

            // Act
            const throws = () => None.unwrap()

            // Assert
            expect(throws).toThrow(EmptyOptionError)
        })

        it('should unwrap empty option to a error result', function () {
            // Act
            const result = None.toResult()

            // Assert
            expect(result.isError).toBe(true)
            expect(result.isOk).toBe(false)
            expect(result.unwrapError()).toBeInstanceOf(EmptyOptionError)
        })

        it('should fallback on a default value if the option is empty', function () {
            // Arrange

            // Act
            const value = None.unwrapOr(true)

            // Assert
            expect(value).toBe(true)
        })
    })
})
