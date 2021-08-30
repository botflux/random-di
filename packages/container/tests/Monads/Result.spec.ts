import {Err, Ok} from '../../src/Monads/Result'

describe('result type wraps values and errors', function () {
    describe('ok result wraps a value', function () {
        it('should encapsulate a value into a Ok result', function () {
            // Arrange
            const value = 12

            // Act
            const result = Ok(value)

            // Assert
            expect(result.unwrap()).toBe(12)
            expect(result.isOk).toBe(true)
            expect(result.isError).toBe(false)
        })

        it('should map a ok result to another ok result', function () {
            // Arrange
            const value = 23

            // Act
            const result = Ok(value)
                .map(v => v * 2)

            // Assert
            expect(result.unwrap()).toBe(46)
            expect(result.isOk).toBe(true)
            expect(result.isError).toBe(false)
        })

        it('should map a ok result to an error result if the mapping function throws an error', function () {
            // Arrange
            const value = 23

            // Act
            const result = Ok(value)
                .map(v => {
                    throw new Error('hello world')
                })

            // Assert
            expect(result.unwrapError()).toEqual(new Error('hello world'))
            expect(result.isOk).toBe(false)
            expect(result.isError).toBe(true)
        })
    })

    describe('error result wraps an error', function () {
        it('should encapsulate an error into a Error result', function () {
            // Arrange
            const error = new Error('hello world')

            // Act
            const result = Err(error)

            // Assert
            expect(result.unwrapError()).toEqual(new Error('hello world'))
            expect(result.isOk).toBe(false)
            expect(result.isError).toBe(true)
        })

        it('should map a error result to another error result', function () {
            // Arrange
            const error = new Error('hello world')

            // Act
            const result = Err(error)
                .mapError(error => new TypeError('type error'))

            // Assert
            expect(result.unwrapError()).toEqual(new TypeError('type error'))
            expect(result.isOk).toBe(false)
            expect(result.isError).toBe(true)
        })
    })
})
