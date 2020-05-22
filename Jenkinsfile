@Library('pipeline') _

def version = '20.4000'

node ('controls') {
    checkout_pipeline("20.4000/bugfix/bls/fix_test_cli")
    run_branch = load '/home/sbis/jenkins_pipeline/platforma/branch/run_branch'
    run_branch.execute('test-cli', version)
}