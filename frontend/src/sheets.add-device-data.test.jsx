// @vitest-environment happy-dom
// The sign-in question about entries logged while signed out: a count of one reads in the
// singular ("1 workout and 1 weigh-in"), per noun, in English and in the packs.
//
// This build ships English and Chinese. Chinese has no plural form, so the singular/plural
// distinction the English case pins does not exist there — what the Chinese case checks is
// that the pack's own sentence is what comes out, not the English one.
import { afterEach, describe, expect, it } from 'vitest'
import { _setLangState } from './lib/i18n-core.js'
import { addDeviceDataMessage, addDeviceSetupMessage } from './sheets.jsx'
import zh from './locales/zh.js'

afterEach(() => _setLangState('en', null, null, null))

describe('addDeviceDataMessage', () => {
  it('says "1 workout and 1 weigh-in", not "1 workouts and 1 weigh-ins"', () => {
    _setLangState('en', null, null, null)
    expect(addDeviceDataMessage(1, 1)).toMatch(/^1 workout and 1 weigh-in were logged/)
    expect(addDeviceDataMessage(1, 3)).toMatch(/^1 workout and 3 weigh-ins were logged/)
    expect(addDeviceDataMessage(4, 1)).toMatch(/^4 workouts and 1 weigh-in were logged/)
    expect(addDeviceDataMessage(2, 5)).toMatch(/^2 workouts and 5 weigh-ins were logged/)
    expect(addDeviceDataMessage(0, 2)).toMatch(/^0 workouts and 2 weigh-ins were logged/)
  })

  it('uses the pack’s own sentences when a language is active', () => {
    _setLangState('zh', zh, null, null)
    // Han characters, and the counts the call was given: the pack answered, not English.
    expect(addDeviceDataMessage(1, 1)).toMatch(/^此设备.*1 次训练.*1 次体重/)
    expect(addDeviceDataMessage(1, 2)).toMatch(/^此设备.*1 次训练.*2 次体重/)
    expect(addDeviceDataMessage(3, 1)).toMatch(/^此设备.*3 次训练.*1 次体重/)
  })

  it('a plan made while signed out has words of its own', () => {
    _setLangState('en', null, null, null)
    expect(addDeviceSetupMessage(1)).toMatch(/^1 routine was made on this device/)
    expect(addDeviceSetupMessage(3)).toMatch(/^3 routines were made on this device/)
    expect(addDeviceSetupMessage(0)).toMatch(/^Your plan, notes or gym cards/)
    _setLangState('zh', zh, null, null)
    expect(addDeviceSetupMessage(2)).toMatch(/^此设备.*2 个训练计划/)
  })
})
