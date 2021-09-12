import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'
import * as io from '@actions/io'
import {ExecOptions} from '@actions/exec/lib/interfaces'

const IS_WINDOWS = process.platform === 'win32'
const SQL_VERSION = core.getInput('sql-version') || 'latest'
const VSWHERE_PATH = core.getInput('vswhere-path')
const ALLOW_PRERELEASE = core.getInput('vs-prerelease') || 'false'

// if a specific version of SqlServer is requested
let SQL_VERSION_PATH = ''
if (SQL_VERSION === 'latest') {
  SQL_VERSION_PATH += '15' //2019
} else {
  SQL_VERSION_PATH = SQL_VERSION
}
let VSWHERE_EXEC = '-find "**\\SQLDB\\**\\' + SQL_VERSION_PATH + '*\\SqlPackage.exe" '

if (ALLOW_PRERELEASE === 'true') {
  VSWHERE_EXEC += ' -prerelease '
}
core.debug(`Execution arguments: ${VSWHERE_EXEC}`)

async function run(): Promise<void> {
  try {
    // exit if non Windows runner
    if (IS_WINDOWS === false) {
      core.setFailed('setup-sqlpackage can only be run on Windows runners')
      return
    }

    // check to see if we are using a specific path for vswhere
    let vswhereToolExe = ''

    if (VSWHERE_PATH) {
      // specified a path for vswhere, use it
      core.debug(`Using given vswhere-path: ${VSWHERE_PATH}`)
      vswhereToolExe = path.join(VSWHERE_PATH, 'vswhere.exe')
    } else {
      // check in PATH to see if it is there
      try {
        const vsWhereInPath: string = await io.which('vswhere', true)
        core.debug(`Found tool in PATH: ${vsWhereInPath}`)
        vswhereToolExe = vsWhereInPath
      } catch {
        // fall back to VS-installed path
        vswhereToolExe = path.join(
          process.env['ProgramFiles(x86)'] as string,
          'Microsoft Visual Studio\\Installer\\vswhere.exe'
        )
        core.debug(`Trying Visual Studio-installed path: ${vswhereToolExe}`)
      }
    }

    if (!fs.existsSync(vswhereToolExe)) {
      core.setFailed(
        'setup-sqlpackage cannot find the path to where vswhere.exe exists'
      )

      return
    }

    core.debug(`Full tool exe: ${vswhereToolExe}`)

    let foundToolPath = ''
    const options: ExecOptions = {}
    options.listeners = {
      stdout: (data: Buffer) => {
        const installationPath = data.toString().trim()
        core.debug(`Found installation path: ${installationPath}`)

        let toolPath = installationPath

        core.debug(`Checking for path: ${toolPath}`)
        if (!fs.existsSync(toolPath)) {
          toolPath = installationPath

          core.debug(`Checking for path: ${toolPath}`)
          if (!fs.existsSync(toolPath)) {
            return
          }
        }

        foundToolPath = toolPath
      }
    }

    // execute the find putting the result of the command in the options foundToolPath
    await exec.exec(`"${vswhereToolExe}" ${VSWHERE_EXEC}`, [], options)

    if (!foundToolPath) {
      let MISC_PATHS = ''

      // build tools installs
      MISC_PATHS = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\Common7\\IDE\\Extensions\\Microsoft\\SQLDB\\DAC\\' + SQL_VERSION_PATH +'0\\sqlpackage.exe'
      if(fs.existsSync(MISC_PATHS)) { 
        foundToolPath = MISC_PATHS 
      }
      // VS 22 preview tools
      MISC_PATHS = 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Preview\\Common7\\IDE\\Extensions\\Microsoft\\SQLDB\\DAC\\sqlpackage.exe'
      if(fs.existsSync(MISC_PATHS)) { 
        foundToolPath = MISC_PATHS 
      }
      // old build tools
      MISC_PATHS = 'C:\\Program Files (x86)\\Microsoft Visual Studio\\2017\\BuildTools\\Common7\\IDE\\Extensions\\Microsoft\\SQLDB\\DAC\\' + SQL_VERSION_PATH +'0\\sqlpackage.exe'
      if(fs.existsSync(MISC_PATHS)) { 
        foundToolPath = MISC_PATHS 
      }

      if (!foundToolPath) { 
        core.setFailed('Unable to find SqlPackage using vswhere, attempting to check default buildtool locations')
        return 
      }
    }

    // extract the folder location for the tool
    const toolFolderPath = path.dirname(foundToolPath)

    // set the outputs for the action to the folder path of msbuild
    core.setOutput('sqlpackagePath', toolFolderPath)

    // add tool path to PATH
    core.addPath(toolFolderPath)
    core.debug(`Tool path added to PATH: ${toolFolderPath}`)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
