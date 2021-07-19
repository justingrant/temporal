#! /usr/bin/env -S node --experimental-modules

/*
 ** Copyright (C) 2018-2019 Bloomberg LP. All rights reserved.
 ** This code is governed by the license found in the LICENSE file.
 */

import { report } from 'mocha'

// tests with long tedious output
import './datemath.mjs'
import './regex.mjs'

// tests of internals
import './ecmascript.mjs'

// tests of public API
import './exports.mjs'
import './now.mjs'
import './timezone.mjs'
import './instant.mjs'
import './zoneddatetime.mjs'
import './plaindate.mjs'
import './plaintime.mjs'
import './plaindatetime.mjs'
import './duration.mjs'
import './plainyearmonth.mjs'
import './plainmonthday.mjs'
import './intl.mjs'
import './calendar.mjs'

// tests of userland objects
import './usertimezone.mjs'
import './usercalendar.mjs'

Promise.resolve()
  .then(() => {
    return report()
  })
  .then((failed) => {
    return process.exit(failed ? 1 : 0)
  })
  .catch((e) => {
    console.error(e)
    process.exit(-1)
  })
