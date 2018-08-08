import { directoryExists, fileExists } from './utils';
import * as fs from 'fs';
import * as path from 'path';
const drivelist: any = require('drivelist');
import { bindNodeCallback, Observable, of, Subject } from 'rxjs';
import { Directory, LocalFile, LocalFileType } from '../../libs/schema/src';
import { catchError, map, switchMap, zipAll } from 'rxjs/operators';
import * as os from 'os';

const observableReadDir = bindNodeCallback(fs.readdir);
const observableStat = bindNodeCallback(fs.stat);

export function readDirectory(
  dirName: string,
  onlyDirectories: boolean,
  showHidden: boolean
): Observable<Directory> {
  if (dirName === '' && os.platform() === 'win32') {
    return mountPoints();
  } else if (dirName === '') {
    return _readDirectory('/', onlyDirectories, showHidden);
  } else {
    if (dirName !== '/' && !directoryExists(dirName)) {
      throw new Error(`Cannot find directory: '${dirName}'`);
    }
    return _readDirectory(dirName, onlyDirectories, showHidden);
  }
}

function _readDirectory(
  dirName: string,
  onlyDirectories: boolean,
  showHidden: boolean
) {
  return observableReadDir(dirName).pipe(
    switchMap(
      (files: Array<string>): Array<Observable<LocalFile | null>> => {
        return files.map(
          (c): Observable<LocalFile | null> => {
            const child = path.join(dirName, c);

            return observableStat(child).pipe(
              switchMap(
                (stat: fs.Stats): Observable<LocalFile> => {
                  if (!stat.isDirectory()) {
                    return of({ name: c, type: 'file' as LocalFileType });
                  }
                  return fileExists(path.join(dirName, c, 'angular.json')).pipe(
                    map(() => {
                      return {
                        name: c,
                        type: 'angularDirectory' as LocalFileType
                      };
                    }),
                    catchError(
                      (): Observable<LocalFile> => {
                        return of({
                          name: c,
                          type: 'directory' as LocalFileType
                        });
                      }
                    )
                  );
                }
              ),
              catchError(
                (): Observable<LocalFile | null> => {
                  return of(null);
                }
              )
            );
          }
        );
      }
    ),
    zipAll(),
    map(
      (files: Array<LocalFile | null>): Directory => {
        return {
          path: dirName,
          files: files.filter(t => {
            if (!t) return false;

            let show = true;
            if (onlyDirectories && t.type === 'file') {
              show = false;
            }
            if (!showHidden && t.name.startsWith('.')) {
              show = false;
            }
            return show;
          }) as any
        };
      }
    )
  );
}

export function mountPoints(): Observable<Directory> {
  const res = new Subject<Directory>();

  drivelist.list((errors: any, drives: any) => {
    if (errors) {
      res.error(errors[0]);
    } else {
      let mountpoints: any = [];
      drives.forEach((d: any) => {
        mountpoints = [
          ...mountpoints,
          ...d.mountpoints.map((p: any) => {
            const name = p.path.endsWith('\\')
              ? `${p.path.substring(0, p.path.length - 1)}//`
              : p.path;
            return { name, type: 'directory' };
          })
        ];
      });
      res.next({ path: '', files: mountpoints });
      res.complete();
    }
  });

  return res;
}
