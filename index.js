const core = require('@actions/core');
const github = require('@actions/github');
const { Octokit } = require('@octokit/rest');
const { execSync } = require('child_process');
const { chdir } = require('process');

const PERSONAL_ACCESS_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
const octokit = new Octokit({
  auth: PERSONAL_ACCESS_TOKEN,
});


async function createRelease(repoName,tag, name, body) {
  await octokit.repos.createRelease({
    owner: 'bhoos',
    repo: repoName,
    tag_name: tag,
    name,
    body,
    draft: true
  });
}

function getPackageProperty(property) {
  return execSync(`node -p "require('./package.json').${property}"`).toString().trim();
}

function getRepoName() {
  return execSync(`basename $(git remote get-url origin)`).toString().trim().split('.')[0];
}

try {
  // check if draft has been released from master
  const { payload } = github.context;
  const { repository, ref } = payload;
  const { html_url, name } = repository;

  execSync(`echo -e "machine github.com\n  login ${PERSONAL_ACCESS_TOKEN}" >> ~/.netrc`)
  execSync(`git config --global user.email action@bhoos.com`);
  execSync(`git config --global user.name 'Bhoos Action'`);


  execSync(`git clone ${html_url}`);
  chdir(`${name}`)
  console.log(execSync('ls -la').toString(), repository, name);
  execSync("for remote in `git branch -r`; do git branch --track ${remote#origin/} $remote; done")
  execSync(`git fetch origin`);
  execSync('git fetch --all');

  const release = !!(payload.action && payload.action === 'published');
  if (release) {
    const packageName = getPackageProperty('name');
    const currentVersion = getPackageProperty('version');
    // add latest tag to the current version of package
    console.log('....Adding latest Tag to current version of Package....');
    execSync(`npm dist-tag add ${packageName}@${currentVersion} latest`);
  } else {
    const branch = ref.split('/')[2];
    execSync('git config pull.ff only');
    execSync(`git checkout origin ${branch} && git pull origin ${branch}`);

    // setup  npmrc
    execSync(`echo "//npm.pkg.github.com/bhoos/:_authToken=${PERSONAL_ACCESS_TOKEN}" > ~/.npmrc`);
    execSync(`echo "//npm.pkg.github.com/:_authToken=${PERSONAL_ACCESS_TOKEN}" >> ~/.npmrc`);


    // make sure the branch is upto date with master
    execSync(`git checkout -b temp`);
    execSync('git pull origin master');
    // update the version
    console.log(`....Updating npm version using ${branch}....`);
    execSync(`npm version ${branch} -m "Release ${branch} version %s"`);


  // build the package and test it
    execSync(`yarn`);
    execSync(`yarn build`);
    execSync(`yarn test`);


     // push the updates from temp branch to both the current branch and master branch
    console.log(`....Pushing Changes to ${branch} branch....`);
    execSync(`git push origin temp:${branch}`);

    console.log('....Pushing Changes to master branch....');
    execSync(`git push origin temp:master`);



    console.log('....Publishing Package With Next Tag....');
    execSync(`npm publish --tag=next`);


    // create a draft with a tag of version name with v suffix
    const tagName = `v${getPackageProperty('version')}`;
    const repoName = getRepoName();

    console.log('....Creating a release....');
    createRelease(repoName, tagName, '', '').catch(e => {
      if (e) throw `Draft Release error ${e}`;
    });

  }

}  catch (error) {
  core.setFailed(error.message);
}
