pipeline {
    agent any

    environment {
        GHCR_USER = 'nikita65288'
        GHCR_CREDENTIALS_ID = 'github-ghcr-token'
        IMAGE_NAME = 'ghcr.io/nikita65288/familiar-faces-frontend'
        IMAGE_TAG = "${env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Docker Login') {
            steps {
                withCredentials([usernamePassword(
                    credentialsId: "${GHCR_CREDENTIALS_ID}",
                    passwordVariable: 'GH_TOKEN',
                    usernameVariable: 'GH_USER'
                )]) {
                    sh 'echo $GH_TOKEN | docker login ghcr.io -u $GH_USER --password-stdin'
                }
            }
        }

        stage('Docker Build & Push') {
            steps {
                sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest ."
                sh "docker push ${IMAGE_NAME}:${IMAGE_TAG}"
                sh "docker push ${IMAGE_NAME}:latest"
            }
        }
    }

    post {
        always {
            sh 'docker system prune -f || true'
            sh 'docker logout ghcr.io || true'
        }
    }
}