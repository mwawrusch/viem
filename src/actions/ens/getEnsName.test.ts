import { beforeAll, describe, expect, test } from 'vitest'

import { address, localHttpUrl } from '~test/src/constants.js'
import {
  createHttpServer,
  publicClient,
  setBlockNumber,
  setVitalikName,
  setVitalikResolver,
} from '~test/src/utils.js'
import { optimism } from '../../chains/index.js'
import { createPublicClient } from '../../clients/createPublicClient.js'
import { http } from '../../clients/transports/http.js'

import { parseAbi } from 'abitype'
import { encodeErrorResult, encodeFunctionResult } from '~viem/index.js'
import { getEnsName } from './getEnsName.js'

beforeAll(async () => {
  await setBlockNumber(18958931n)
  await setVitalikResolver()
})

test('gets primary name for address', async () => {
  await expect(
    getEnsName(publicClient, {
      address: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
    }),
  ).resolves.toMatchInlineSnapshot('"awkweb.eth"')
})

test('gatewayUrls provided', async () => {
  await setVitalikName('1.offchainexample.eth')
  let called = false

  const server = await createHttpServer((_, res) => {
    called = true
    res.end()
  })

  await getEnsName(publicClient, {
    address: address.vitalik,
    gatewayUrls: [server.url],
  }).catch(() => {})

  expect(called).toBe(true)
})

test('address with no primary name', async () => {
  await expect(
    getEnsName(publicClient, {
      address: address.burn,
    }),
  ).resolves.toMatchInlineSnapshot('null')
})

test('address with primary name that has no resolver', async () => {
  await expect(
    getEnsName(publicClient, {
      address: '0x00000000000061aD8EE190710508A818aE5325C3',
    }),
  ).resolves.toMatchInlineSnapshot('null')
})

test('address with primary name that has no resolver - strict', async () => {
  await expect(
    getEnsName(publicClient, {
      address: '0x00000000000061aD8EE190710508A818aE5325C3',
      strict: true,
    }),
  ).rejects.toMatchInlineSnapshot(`
    [ContractFunctionExecutionError: The contract function "reverse" reverted.

    Error: ResolverWildcardNotSupported()
     
    Contract Call:
      address:   0x0000000000000000000000000000000000000000
      function:  reverse(bytes reverseName)
      args:             (0x28303030303030303030303030363161643865653139303731303530386138313861653533323563330461646472077265766572736500)

    Docs: https://viem.sh/docs/contract/readContract.html
    Version: viem@1.0.2]
  `)
})

describe('primary name with resolver that does not support text()', () => {
  beforeAll(async () => {
    await setVitalikName('vitalik.eth')
  })
  test('non-strict', async () => {
    await expect(
      getEnsName(publicClient, {
        address: address.vitalik,
      }),
    ).resolves.toMatchInlineSnapshot('null')
  })
  test('strict', async () => {
    await expect(
      getEnsName(publicClient, {
        address: address.vitalik,
        strict: true,
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: The contract function "reverse" reverted.

      Error: ResolverError(bytes returnData)
                          (0x)
       
      Contract Call:
        address:   0x0000000000000000000000000000000000000000
        function:  reverse(bytes reverseName)
        args:             (0x28643864613662663236393634616639643765656439653033653533343135643337616139363034350461646472077265766572736500)

      Docs: https://viem.sh/docs/contract/readContract.html
      Version: viem@1.0.2]
    `)
  })
})

describe('primary name with non-contract resolver', () => {
  beforeAll(async () => {
    await setVitalikName('vbuterin.eth')
  })
  test('non-strict', async () => {
    await expect(
      getEnsName(publicClient, {
        address: address.vitalik,
      }),
    ).resolves.toMatchInlineSnapshot('null')
  })
  test('strict', async () => {
    await expect(
      getEnsName(publicClient, {
        address: address.vitalik,
        strict: true,
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: The contract function "reverse" reverted.

      Error: ResolverNotContract()
       
      Contract Call:
        address:   0x0000000000000000000000000000000000000000
        function:  reverse(bytes reverseName)
        args:             (0x28643864613662663236393634616639643765656439653033653533343135643337616139363034350461646472077265766572736500)

      Docs: https://viem.sh/docs/contract/readContract.html
      Version: viem@1.0.2]
    `)
  })
})

describe('http error', () => {
  let server: Awaited<ReturnType<typeof createHttpServer>> | undefined
  beforeAll(async () => {
    await setVitalikName('1.offchainexample.eth')
    server = await createHttpServer((_, res) => {
      const parsed = parseAbi([
        'function query((address,string[],bytes)[]) returns (bool[],bytes[])',
        'error HttpError((uint16,string)[])',
      ])

      const encoded = encodeFunctionResult({
        abi: parsed,
        functionName: 'query',
        result: [
          [true],
          [
            encodeErrorResult({
              abi: parsed,
              errorName: 'HttpError',
              args: [[[404, 'Not Found']]],
            }),
          ],
        ],
      })

      const response = JSON.stringify({ data: encoded })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.write(response)
      res.end()
    })
  })
  test('non-strict', async () => {
    await expect(
      getEnsName(publicClient, {
        address: address.vitalik,
        gatewayUrls: [server!.url],
      }),
    ).resolves.toBeNull()
  })
  test('strict', async () => {
    await expect(
      getEnsName(publicClient, {
        address: address.vitalik,
        gatewayUrls: [server!.url],
        strict: true,
      }),
    ).rejects.toThrowError(`The contract function "reverse" reverted.

Error: ResolverError(bytes returnData)
                    (0xca7a4e75`)
  })
})

test('custom universal resolver address', async () => {
  await expect(
    getEnsName(publicClient, {
      address: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
      universalResolverAddress: '0x74E20Bd2A1fE0cdbe45b9A1d89cb7e0a45b36376',
    }),
  ).resolves.toMatchInlineSnapshot('"awkweb.eth"')
})

describe('universal resolver with generic errors', () => {
  test('address with primary name that has no resolver', async () => {
    await expect(
      getEnsName(publicClient, {
        address: '0x00000000000061aD8EE190710508A818aE5325C3',
        universalResolverAddress: '0xc0497E381f536Be9ce14B0dD3817cBcAe57d2F62',
      }),
    ).resolves.toMatchInlineSnapshot('null')
  })
  test('address with primary name that has no resolver - strict', async () => {
    await expect(
      getEnsName(publicClient, {
        address: '0x00000000000061aD8EE190710508A818aE5325C3',
        universalResolverAddress: '0xc0497E381f536Be9ce14B0dD3817cBcAe57d2F62',
        strict: true,
      }),
    ).rejects.toMatchInlineSnapshot(`
      [ContractFunctionExecutionError: The contract function "reverse" reverted with the following reason:
      UniversalResolver: Wildcard on non-extended resolvers is not supported

      Contract Call:
        address:   0x0000000000000000000000000000000000000000
        function:  reverse(bytes reverseName)
        args:             (0x28303030303030303030303030363161643865653139303731303530386138313861653533323563330461646472077265766572736500)

      Docs: https://viem.sh/docs/contract/readContract.html
      Version: viem@1.0.2]
    `)
  })
})

test('chain not provided', async () => {
  await expect(
    getEnsName(
      createPublicClient({
        transport: http(localHttpUrl),
      }),
      { address: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e' },
    ),
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    '[Error: client chain not configured. universalResolverAddress is required.]',
  )
})

test('universal resolver contract not configured for chain', async () => {
  await expect(
    getEnsName(
      createPublicClient({
        chain: optimism,
        transport: http(),
      }),
      {
        address: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
      },
    ),
  ).rejects.toThrowErrorMatchingInlineSnapshot(`
    [ChainDoesNotSupportContract: Chain "OP Mainnet" does not support contract "ensUniversalResolver".

    This could be due to any of the following:
    - The chain does not have the contract "ensUniversalResolver" configured.

    Version: viem@1.0.2]
  `)
})

test('universal resolver contract deployed on later block', async () => {
  await expect(
    getEnsName(publicClient, {
      address: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
      blockNumber: 14353601n,
    }),
  ).rejects.toThrowErrorMatchingInlineSnapshot(`
    [ChainDoesNotSupportContract: Chain "Localhost" does not support contract "ensUniversalResolver".

    This could be due to any of the following:
    - The contract "ensUniversalResolver" was not deployed until block 18958930 (current block 14353601).

    Version: viem@1.0.2]
  `)
})

test('invalid universal resolver address', async () => {
  await expect(
    getEnsName(publicClient, {
      address: '0xA0Cf798816D4b9b9866b5330EEa46a18382f251e',
      universalResolverAddress: '0xecb504d39723b0be0e3a9aa33d646642d1051ee1',
    }),
  ).rejects.toThrowErrorMatchingInlineSnapshot(`
    [ContractFunctionExecutionError: The contract function "reverse" reverted.

    Contract Call:
      address:   0x0000000000000000000000000000000000000000
      function:  reverse(bytes reverseName)
      args:             (0x28613063663739383831366434623962393836366235333330656561343661313833383266323531650461646472077265766572736500)

    Docs: https://viem.sh/docs/contract/readContract
    Version: viem@1.0.2]
  `)
})

test('resolved address mismatch', async () => {
  expect(
    await getEnsName(publicClient, {
      address: '0xe756236ef7FD64Ebbb360465C621c7dB5a336F4d',
    }),
  ).toBeNull()
})
