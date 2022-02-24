import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, timeout, map, take } from 'rxjs/operators';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

export interface UserInformations {
  id: number;
  role: string;
  username: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  isAuth = false;
  public userInfo: UserInformations;
  logStatusChange: Subject<boolean> = new Subject<boolean>();
  logUserInfoChange: Subject<UserInformations> = new Subject<UserInformations>();

  constructor(private httpClient: HttpClient, private router: Router) { }

  login(url: string, oldUrl: string): void {
    let headers = new HttpHeaders();
    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', url, { headers }).pipe(
      timeout(10000),
      map(res => {
        return res;
      },
      ), catchError(
        err => {
          if (err.error.message === 'alreadyLogged') {
            this.redirect('/select');
          } else {
            console.error(err.error.message);
          }
          throw err;
        },
      )).pipe(take(1))
      .subscribe((response: UserInformations) => {
        const userInfo = {
          id: response.id,
          role: response.role,
          username: response.username,
        };
        this.updateUserInfo(userInfo);
        this.updateLogStatus(true);
        if (oldUrl !== undefined) {
          this.router.navigateByUrl(oldUrl);
        } else {
          this.router.navigateByUrl('/select');
        }
      });
  }

  logout(): boolean {
    const isLogged: boolean = this.isAuth;

    if (isLogged === false) {
      return false;
    }

    const loggedApiUrl = '/ws/User/Logout';
    let headers = new HttpHeaders();

    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', loggedApiUrl, { headers }).pipe(
      timeout(10000),
      map(res => {
        return res;
      },
      ), catchError(
        err => {
          console.log('an error occured please try again');
          throw err;
        },
      )).pipe(take(1))
      .subscribe(() => {
        this.redirect('/login');
        this.updateLogStatus(false);
      });
    return isLogged;
  }

  isLogged(url?: string): void | boolean {
    const loggedApiUrl = '/ws/User/Logged';
    let headers = new HttpHeaders();

    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', loggedApiUrl, { headers }).pipe(
      timeout(10000),
      map(res => {
        return res;
      },
      ), catchError(
        err => {
          this.updateLogStatus(false);
          console.log('user not logged');
          throw err;
        },
      )).pipe(take(1))
      .subscribe((response: UserInformations) => {
        if (response === null) {
          this.updateLogStatus(false);
          this.redirect('/login');
          return false;
        }
        const userInfo = {
          id: response.id,
          role: response.role,
          username: response.username,
        };
        this.updateUserInfo(userInfo);
        this.updateLogStatus(true);

        if (url === undefined) {
          url = '/select';
        }
        this.router.navigateByUrl(url);
        return true;
      });
  }

  redirect(url: string): void {
    this.router.navigateByUrl(url, { state: this.userInfo });
  }

  updateLogStatus(status: boolean): void {
    this.isAuth = status;
    this.logStatusChange.next(this.isAuth);
  }

  updateUserInfo(userInfo: UserInformations): void {
    this.userInfo = userInfo;
    this.logUserInfoChange.next(this.userInfo);
  }
}

